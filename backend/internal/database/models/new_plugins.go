package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// --- Class Management (AI 반편성) ---

type ClassAssignmentSession struct {
	ID          uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID    uuid.UUID      `gorm:"type:uuid;index" json:"school_id"`
	Title       string         `gorm:"type:varchar(255);not null" json:"title"` // 예: 2026학년도 신입생 반편성
	TargetGrade int            `json:"target_grade"`
	Status      string         `gorm:"type:varchar(50);default:'collecting'" json:"status"` // collecting, processing, completed
	CreatedAt   time.Time      `json:"created_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type ParentClassRequest struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SessionID uuid.UUID `gorm:"type:uuid;index" json:"session_id"`
	StudentID uuid.UUID `gorm:"type:uuid;index" json:"student_id"`
	ParentID  uuid.UUID `gorm:"type:uuid;index" json:"parent_id"`
	Request   string    `gorm:"type:text" json:"request"` // "OOO 학생과 같은 반 희망" 등
	CreatedAt time.Time `json:"created_at"`
}

// --- Resource Management (특별실/자원 관리) ---

type Facility struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID    uuid.UUID `gorm:"type:uuid;index" json:"school_id"`
	Name        string    `gorm:"type:varchar(100);not null" json:"name"` // 컴퓨터실, 체육관 등
	Location    string    `gorm:"type:varchar(255)" json:"location"`      // 본관 3층 등
	Description string    `json:"description"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
}

type FacilityReservation struct {
	ID         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	FacilityID uuid.UUID `gorm:"type:uuid;index" json:"facility_id"`
	TeacherID  uuid.UUID `gorm:"type:uuid;index" json:"teacher_id"`
	StartTime  time.Time `json:"start_time"`
	EndTime    time.Time `json:"end_time"`
	Purpose    string    `json:"purpose"` // 수업 내용 등
	CreatedAt  time.Time `json:"created_at"`
}

// --- School Administration (행정/인사) ---

type TaskHandover struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID    uuid.UUID `gorm:"type:uuid;index" json:"school_id"`
	FromUserID  uuid.UUID `gorm:"type:uuid" json:"from_user_id"`
	ToUserID    uuid.UUID `gorm:"type:uuid" json:"to_user_id"`
	TaskName    string    `gorm:"type:varchar(255)" json:"task_name"`
	Content     string    `gorm:"type:text" json:"content"`
	FilesURL    string    `json:"files_url"` // 관련 문서 묶음 링크
	IsConfirmed bool      `gorm:"default:false" json:"is_confirmed"`
	CreatedAt   time.Time `json:"created_at"`
}

type MultiEvaluation struct {
	ID             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID       uuid.UUID `gorm:"type:uuid;index" json:"school_id"`
	TargetTeacherID uuid.UUID `gorm:"type:uuid" json:"target_teacher_id"`
	EvaluatorID    uuid.UUID `gorm:"type:uuid" json:"evaluator_id"` // 지정된 다면평가위원만 접근 가능
	Category       string    `json:"category"`               // 승진, 전보, 유공원원 등
	DataJSON       string    `gorm:"type:jsonb" json:"data_json"`
	CreatedAt      time.Time `json:"created_at"`
}
