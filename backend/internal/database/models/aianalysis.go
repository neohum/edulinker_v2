package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AIAnalysisLog stores AI-generated drafts (e.g., student evaluation remarks, budget plans)
type AIAnalysisLog struct {
	ID               uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID         uuid.UUID      `gorm:"type:uuid;not null;index" json:"school_id"`
	TeacherID        uuid.UUID      `gorm:"type:uuid;not null" json:"teacher_id"`
	TargetStudentID  *uuid.UUID     `gorm:"type:uuid" json:"target_student_id,omitempty"` // For student-specific analysis
	PromptType       string         `gorm:"type:varchar(50);not null" json:"prompt_type"` // e.g., 'student_evaluation', 'budget_plan'
	InputData        string         `gorm:"type:text;not null" json:"input_data"`
	GeneratedContent string         `gorm:"type:text;not null" json:"generated_content"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Teacher User  `gorm:"foreignKey:TeacherID" json:"teacher,omitempty"`
	Student *User `gorm:"foreignKey:TargetStudentID" json:"student,omitempty"`
}
