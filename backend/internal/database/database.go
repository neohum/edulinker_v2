package database

import (
	"fmt"
	"log"

	"github.com/edulinker/backend/internal/config"
	"github.com/edulinker/backend/internal/core/filegateway"
	"github.com/edulinker/backend/internal/core/notify"
	"github.com/edulinker/backend/internal/database/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connect establishes a connection to PostgreSQL and runs auto-migration.
func Connect(cfg config.DatabaseConfig) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	log.Println("✅ Connected to PostgreSQL")
	return db, nil
}

// AutoMigrate creates or updates database tables based on models.
func AutoMigrate(db *gorm.DB) error {
	err := db.AutoMigrate(
		&models.School{},
		&models.User{},
		&models.Plugin{},
		&models.SchoolPlugin{},
		&models.PluginPermission{},
		&notify.Notification{},
		&filegateway.FileRecord{},
		&models.Gatong{},
		&models.GatongTarget{},
		&models.GatongResponse{},
		&models.Sendoc{},
		&models.SendocRecipient{},
		&models.TeacherLeaveRecord{},
		&models.StudentCounseling{},
		&models.StudentAbsence{},
		&models.AIAnalysisLog{},
		&models.WeeklyStudyPlan{},
		&models.EvaluationRecord{},
		&models.SchoolVoting{},
		&models.EventRecord{},
		&models.ParentStudent{},
	)
	if err != nil {
		return fmt.Errorf("failed to auto-migrate: %w", err)
	}

	// Drop old unique index on phone (students may not have phone numbers)
	db.Exec("DROP INDEX IF EXISTS idx_users_phone")

	log.Println("✅ Database migration completed")
	return nil
}

// SeedPlugins inserts the Phase 1 plugin definitions if they don't exist.
func SeedPlugins(db *gorm.DB) error {
	plugins := []models.Plugin{
		// Group A — 핵심 소통
		{ID: "messenger", GroupCode: "A", Name: "교사 메신저", Description: "교내 채팅(1:1·그룹·채널), 운영시간 기반 알림", Version: "1.0.0", Status: models.PluginStatusActive},
		{ID: "announcement", GroupCode: "A", Name: "공문전달", Description: "단순·확인·신청·투두 4유형 분류 발송", Version: "1.0.0", Status: models.PluginStatusActive},
		{ID: "todo", GroupCode: "A", Name: "투두리스트", Description: "개인용·학교 공용 투두, 공문 자동 연결", Version: "1.0.0", Status: models.PluginStatusActive},
		{ID: "student-alert", GroupCode: "A", Name: "학생 알림 서비스", Description: "교사→학생 단방향 알림, 디지털 기기 자동 표시", Version: "1.0.0", Status: models.PluginStatusActive},
		{ID: "attendance", GroupCode: "A", Name: "지각·결석 원터치", Description: "학부모 원터치 선택+사유→교사 알림→출결 반영", Version: "1.0.0", Status: models.PluginStatusActive},
		{ID: "gatong", GroupCode: "A", Name: "가정통신문(가통)", Description: "가정통신문·알림·설문·동의서 종합 알림장", Version: "1.0.0", Status: models.PluginStatusActive},
		// Group B — 문서·전자서명
		{ID: "sendoc", GroupCode: "B", Name: "전자문서·서명", Description: "sign-school 연동, 동의서, 서명 및 PDF 결과물 변환", Version: "1.0.0", Status: models.PluginStatusActive},
		// Group D — 학생 관리
		{ID: "studentmgmt", GroupCode: "D", Name: "학생 상담·결석 기록", Description: "학생 개인 상담 일지, 결석생 누적 수기 기록", Version: "1.0.0", Status: models.PluginStatusActive},
		// Group E — 학습·수행평가
		{ID: "curriculum", GroupCode: "E", Name: "주간학습 및 수행평가", Description: "주간학습안내 배포, 학생별 수학/국어 등 단원평가 점수 관리", Version: "1.0.0", Status: models.PluginStatusActive},
		// Group G — AI 분석
		{ID: "aianalysis", GroupCode: "G", Name: "AI 세특·종특 분석", Description: "학생 세특 초안, 교사 의견 자동완성 및 분석", Version: "1.0.0", Status: models.PluginStatusActive},
		// Group H — 학교행사·투표
		{ID: "schoolevents", GroupCode: "H", Name: "학교 행사 및 투표", Description: "온라인 찬반 투표, 앨범/행사 기록", Version: "1.0.0", Status: models.PluginStatusActive},
		// Group I — 인프라·도구
		{ID: "linker", GroupCode: "I", Name: "linker", Description: "웹앱 즐겨찾기 대시보드, 동적 파라미터 바로가기", Version: "1.0.0", Status: models.PluginStatusActive},
		{ID: "pcinfo", GroupCode: "I", Name: "pc-info", Description: "CPU·메모리·IP 수집, 관리자 조회, 스티커 출력", Version: "1.0.0", Status: models.PluginStatusActive},
		{ID: "teacher-screen", GroupCode: "I", Name: "교사화면 설정", Description: "학생 화면에 표시할 서비스 담임 선택", Version: "1.0.0", Status: models.PluginStatusActive},
	}

	for _, p := range plugins {
		result := db.Where("id = ?", p.ID).FirstOrCreate(&p)
		if result.Error != nil {
			return fmt.Errorf("failed to seed plugin %s: %w", p.ID, result.Error)
		}
	}

	// Seed default permissions
	permissions := []models.PluginPermission{
		// Messenger
		{PluginID: "messenger", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		// Announcement
		{PluginID: "announcement", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		// Todo
		{PluginID: "todo", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		// Student Alert
		{PluginID: "student-alert", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		{PluginID: "student-alert", Role: models.RoleStudent, AccessLevel: models.AccessRead},
		{PluginID: "student-alert", Role: models.RoleParent, AccessLevel: models.AccessRead},
		// Attendance
		{PluginID: "attendance", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		{PluginID: "attendance", Role: models.RoleParent, AccessLevel: models.AccessWrite},
		// Gatong
		{PluginID: "gatong", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		{PluginID: "gatong", Role: models.RoleParent, AccessLevel: models.AccessRead},
		{PluginID: "gatong", Role: models.RoleStudent, AccessLevel: models.AccessRead},
		// Sendoc
		{PluginID: "sendoc", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		{PluginID: "sendoc", Role: models.RoleParent, AccessLevel: models.AccessWrite},  // Can sign documents
		{PluginID: "sendoc", Role: models.RoleStudent, AccessLevel: models.AccessWrite}, // Can sign documents
		// Student Management
		{PluginID: "studentmgmt", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		// Curriculum
		{PluginID: "curriculum", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		{PluginID: "curriculum", Role: models.RoleStudent, AccessLevel: models.AccessRead},
		{PluginID: "curriculum", Role: models.RoleParent, AccessLevel: models.AccessRead},
		// AI Analysis
		{PluginID: "aianalysis", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		{PluginID: "aianalysis", Role: models.RoleAdmin, AccessLevel: models.AccessWrite},
		// School Events
		{PluginID: "schoolevents", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		{PluginID: "schoolevents", Role: models.RoleAdmin, AccessLevel: models.AccessWrite},
		{PluginID: "schoolevents", Role: models.RoleStudent, AccessLevel: models.AccessWrite}, // Can vote
		{PluginID: "schoolevents", Role: models.RoleParent, AccessLevel: models.AccessWrite},  // Can vote
		// Linker
		{PluginID: "linker", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		{PluginID: "linker", Role: models.RoleStudent, AccessLevel: models.AccessRead},
		{PluginID: "linker", Role: models.RoleParent, AccessLevel: models.AccessRead},
		// PC Info
		{PluginID: "pcinfo", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
		// Teacher Screen
		{PluginID: "teacher-screen", Role: models.RoleTeacher, AccessLevel: models.AccessWrite},
	}

	for _, perm := range permissions {
		result := db.Where("plugin_id = ? AND role = ?", perm.PluginID, perm.Role).FirstOrCreate(&perm)
		if result.Error != nil {
			return fmt.Errorf("failed to seed permission: %w", result.Error)
		}
	}

	log.Println("✅ Plugin seed data inserted")
	return nil
}
