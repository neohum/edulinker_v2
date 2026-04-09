package syncagent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/edulinker/backend/internal/database/models"
	"gorm.io/gorm"
)

const adminServerVersion = "v1.0.0"

// AdminHeartbeat sends school registration and periodic stats to the admin-web on Railway.
// 모든 통신은 학교 서버 → admin-web 단방향(outbound)이므로 내부망은 외부에 노출되지 않습니다.
type AdminHeartbeat struct {
	db       *gorm.DB
	adminURL string
	apiKey   string
	client   *http.Client
}

func NewAdminHeartbeat(db *gorm.DB) *AdminHeartbeat {
	adminURL := os.Getenv("ADMIN_SYNC_URL")
	if adminURL == "" {
		adminURL = "https://edulinkeradminweb-production.up.railway.app"
	}
	return &AdminHeartbeat{
		db:       db,
		adminURL: adminURL,
		apiKey:   os.Getenv("ADMIN_SYNC_KEY"),
		client:   &http.Client{Timeout: 15 * time.Second},
	}
}

// Start launches the background heartbeat goroutine.
func (h *AdminHeartbeat) Start() {
	go func() {
		// 초기 대기: DB 마이그레이션 및 서비스 초기화 완료 후 실행
		time.Sleep(20 * time.Second)

		// 최초 등록 (실패 시 재시도)
		h.registerWithRetry()

		// 5분마다 heartbeat 전송 (heartbeat도 UPSERT이므로 등록 겸용)
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			h.sendHeartbeat()
		}
	}()
}

// registerWithRetry: 최대 5회, 지수 백오프로 재시도
func (h *AdminHeartbeat) registerWithRetry() {
	backoff := 10 * time.Second
	for attempt := 1; attempt <= 5; attempt++ {
		if err := h.register(); err != nil {
			log.Printf("[AdminHeartbeat] 등록 실패 (시도 %d/5): %v — %s 후 재시도", attempt, err, backoff)
			time.Sleep(backoff)
			backoff *= 2
			continue
		}
		return
	}
	log.Printf("[AdminHeartbeat] 등록 5회 실패. 이후 heartbeat에서 자동 UPSERT됩니다.")
}

func (h *AdminHeartbeat) register() error {
	school, err := h.getSchool()
	if err != nil {
		return err
	}

	payload := map[string]string{
		"school_code":    school.Code,
		"school_name":    school.Name,
		"server_version": adminServerVersion,
	}
	if err := h.post("/api/sync/register", payload); err != nil {
		return err
	}
	log.Printf("[AdminHeartbeat] 학교 등록 완료: %s (%s)", school.Name, school.Code)
	return nil
}

func (h *AdminHeartbeat) sendHeartbeat() {
	school, err := h.getSchool()
	if err != nil {
		log.Printf("[AdminHeartbeat] 학교 정보 조회 실패: %v", err)
		return
	}

	// 사용자 수 집계
	var teacherCount, studentCount, parentCount int64
	h.db.Model(&models.User{}).
		Where("school_id = ? AND role IN ? AND is_active = ?", school.ID, []string{"teacher", "admin"}, true).
		Count(&teacherCount)
	h.db.Model(&models.User{}).
		Where("school_id = ? AND role = ? AND is_active = ?", school.ID, "student", true).
		Count(&studentCount)
	h.db.Model(&models.User{}).
		Where("school_id = ? AND role = ? AND is_active = ?", school.ID, "parent", true).
		Count(&parentCount)

	// 활성 플러그인 ID 목록
	var schoolPlugins []models.SchoolPlugin
	h.db.Where("school_id = ? AND enabled = ?", school.ID, true).Find(&schoolPlugins)
	activePluginIDs := make([]string, 0, len(schoolPlugins))
	for _, sp := range schoolPlugins {
		activePluginIDs = append(activePluginIDs, sp.PluginID)
	}

	payload := map[string]any{
		"school_code":       school.Code,
		"school_name":       school.Name,
		"teacher_count":     teacherCount,
		"student_count":     studentCount,
		"parent_count":      parentCount,
		"active_plugin_ids": activePluginIDs,
		"server_version":    adminServerVersion,
	}

	if err := h.post("/api/sync/heartbeat", payload); err != nil {
		log.Printf("[AdminHeartbeat] Heartbeat 전송 실패: %v", err)
	}
}

func (h *AdminHeartbeat) getSchool() (models.School, error) {
	var school models.School
	if err := h.db.First(&school).Error; err != nil {
		return school, fmt.Errorf("학교 정보 없음 (아직 /api/setup이 실행되지 않음): %w", err)
	}
	return school, nil
}

func (h *AdminHeartbeat) post(path string, payload any) error {
	if h.apiKey == "" {
		return fmt.Errorf("ADMIN_SYNC_KEY 미설정 — backend/.env 확인")
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("JSON 직렬화 실패: %w", err)
	}

	req, err := http.NewRequest("POST", h.adminURL+path, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("요청 생성 실패: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", h.apiKey))

	resp, err := h.client.Do(req)
	if err != nil {
		return fmt.Errorf("네트워크 오류: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("서버 응답 오류: HTTP %d (URL: %s%s)", resp.StatusCode, h.adminURL, path)
	}
	return nil
}
