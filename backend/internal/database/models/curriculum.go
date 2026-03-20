package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WeeklyStudyPlan represents a weekly study plan for a specific class/grade.
type WeeklyStudyPlan struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID  uuid.UUID      `gorm:"type:uuid;not null;index" json:"school_id"`
	TeacherID uuid.UUID      `gorm:"type:uuid;not null" json:"teacher_id"`
	WeekStart time.Time      `gorm:"type:date;not null" json:"week_start"`
	WeekEnd   time.Time      `gorm:"type:date;not null" json:"week_end"`
	Title     string         `gorm:"type:varchar(255);not null" json:"title"`
	Content   string         `gorm:"type:text;not null" json:"content"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Teacher User `gorm:"foreignKey:TeacherID" json:"teacher,omitempty"`
}

// EvaluationRecord represents a student's performance evaluation (수행평가/단원평가).
type EvaluationRecord struct {
	ID             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID       uuid.UUID `gorm:"type:uuid;not null;index" json:"school_id"`
	TeacherID      uuid.UUID `gorm:"type:uuid;not null" json:"teacher_id"`
	StudentID      uuid.UUID `gorm:"type:uuid;not null" json:"student_id"`
	Subject        string    `gorm:"type:varchar(100);not null" json:"subject"`        // 국어, 수학 등
	EvaluationType string    `gorm:"type:varchar(50);not null" json:"evaluation_type"` // 수행평가, 단원평가
	Score          float64   `gorm:"type:numeric(5,2)" json:"score"`
	Feedback       string    `gorm:"type:text" json:"feedback"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`

	Teacher User `gorm:"foreignKey:TeacherID" json:"teacher,omitempty"`
	Student User `gorm:"foreignKey:StudentID" json:"student,omitempty"`
}
