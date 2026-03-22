package syncagent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/edulinker/backend/internal/database/models"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ParentSyncProvider syncs student roster to cloud and handles parent_link events.
type ParentSyncProvider struct {
	db      *gorm.DB
	syncURL string // e.g. "https://sync-server/api/sync"
}

func NewParentSyncProvider(db *gorm.DB, syncURL string) *ParentSyncProvider {
	return &ParentSyncProvider{db: db, syncURL: syncURL}
}

// GetSyncData returns student roster (public fields only) for cloud caching.
// NOTE: The ID is included here because the Sync-Server wraps it in a HMAC link_token
// before returning to clients — raw IDs are never sent to the parent app.
func (p *ParentSyncProvider) GetSyncData(schoolID string) interface{} {
	type StudentPublic struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Grade    int    `json:"grade"`
		ClassNum int    `json:"class_num"`
		Number   int    `json:"number"`
	}

	var students []models.User
	p.db.Where("school_id = ? AND role = ? AND is_active = ?", schoolID, models.RoleStudent, true).Find(&students)

	result := make([]StudentPublic, len(students))
	for i, s := range students {
		result[i] = StudentPublic{
			ID:       s.ID.String(),
			Name:     s.Name,
			Grade:    s.Grade,
			ClassNum: s.Class,
			Number:   s.Number,
		}
	}
	return result
}

// HandleEvent processes parent_link events popped from the cloud queue.
// Payload: {"student_id":"...", "parent_name":"...", "parent_phone":"..."}
// Writes directly to DB — no HTTP round-trip to local API needed.
func (p *ParentSyncProvider) HandleEvent(payload string) error {
	var req struct {
		StudentID   string `json:"student_id"`
		ParentName  string `json:"parent_name"`
		ParentPhone string `json:"parent_phone"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		log.Printf("[ParentSync] Invalid event payload: %v", err)
		return err
	}
	if req.StudentID == "" || req.ParentPhone == "" {
		log.Printf("[ParentSync] Missing required fields in event")
		return fmt.Errorf("missing required fields")
	}

	studentUID, err := uuid.Parse(req.StudentID)
	if err != nil {
		log.Printf("[ParentSync] Invalid student UUID: %s", req.StudentID)
		return err
	}

	// Validate student exists
	var student models.User
	if err := p.db.Where("id = ? AND role = ? AND is_active = ?", studentUID, models.RoleStudent, true).First(&student).Error; err != nil {
		log.Printf("[ParentSync] Student not found: %s", req.StudentID)
		p.pushCallback(student.SchoolID.String(), req.ParentPhone, "error", "학생을 찾을 수 없습니다.")
		return err
	}

	// Find or create parent account (keyed by phone + role)
	var parent models.User
	if p.db.Where("phone = ? AND role = ?", req.ParentPhone, models.RoleParent).First(&parent).Error != nil {
		tempPw := req.ParentPhone
		if len(tempPw) >= 4 {
			tempPw = tempPw[len(tempPw)-4:]
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(tempPw), bcrypt.DefaultCost)

		// LoginID must be nil (pointer) to avoid unique constraint on empty string
		parent = models.User{
			SchoolID:     student.SchoolID,
			Name:         req.ParentName,
			Phone:        req.ParentPhone,
			Role:         models.RoleParent,
			PasswordHash: string(hash),
			IsActive:     true,
			LoginID:      nil, // explicitly nil — use phone-based login
		}
		if err := p.db.Create(&parent).Error; err != nil {
			log.Printf("[ParentSync] Failed to create parent: %v", err)
			p.pushCallback(student.SchoolID.String(), req.ParentPhone, "error", "계정 생성 실패: "+err.Error())
			return err
		}
		log.Printf("[ParentSync] ✅ Created new parent account: %s (%s) id=%s", parent.Name, parent.Phone, parent.ID)
	} else {
		log.Printf("[ParentSync] Found existing parent account: %s id=%s", parent.Name, parent.ID)
	}

	// Check if already linked
	var existing models.ParentStudent
	if p.db.Where("parent_id = ? AND student_id = ?", parent.ID, studentUID).First(&existing).Error == nil {
		log.Printf("[ParentSync] Already linked: parent=%s student=%s", parent.ID, studentUID)
		p.pushCallback(student.SchoolID.String(), req.ParentPhone, "already_linked", "이미 연동된 학생입니다.")
		return nil
	}

	// Create link
	link := models.ParentStudent{
		ParentID:  parent.ID,
		StudentID: studentUID,
		SchoolID:  student.SchoolID,
		Status:    "approved",
	}
	if err := p.db.Create(&link).Error; err != nil {
		log.Printf("[ParentSync] Failed to create parent-student link: %v", err)
		p.pushCallback(student.SchoolID.String(), req.ParentPhone, "error", "연동 실패: "+err.Error())
		return err
	}

	log.Printf("[ParentSync] ✅ Parent '%s' linked to student '%s'", parent.Name, student.Name)

	// Push success callback to Sync-Server so the parent app can receive the result
	p.pushCallback(student.SchoolID.String(), req.ParentPhone, "linked", fmt.Sprintf(
		"학부모 계정이 %s 학생과 연동되었습니다. 임시 비밀번호: 전화번호 뒷 4자리",
		student.Name,
	))
	return nil
}

// pushCallback sends a link result back to the Sync-Server.
// The parent app can poll GET /api/sync/parent/result/:phone to read it.
func (p *ParentSyncProvider) pushCallback(schoolCode, parentPhone, status, message string) {
	if p.syncURL == "" {
		return
	}
	// Use school_id as school_code fallback — sync-server also accepts school_id
	body, _ := json.Marshal(map[string]string{
		"phone":   parentPhone,
		"status":  status,
		"message": message,
	})
	syncBase := p.syncURL
	if len(syncBase) > 4 && syncBase[len(syncBase)-5:] == "/push" {
		syncBase = syncBase[:len(syncBase)-5]
	}
	url := syncBase + "/parent/result"
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("[ParentSync] Callback push failed: %v", err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[ParentSync] Callback pushed to sync-server: status=%s phone=%s", status, parentPhone)
}

// getEnv helper
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
