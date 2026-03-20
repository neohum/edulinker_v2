package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// StudentCounseling represents a counseling log for a student.
type StudentCounseling struct {
	ID             uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID       uuid.UUID      `gorm:"type:uuid;not null;index" json:"school_id"`
	StudentID      uuid.UUID      `gorm:"type:uuid;not null" json:"student_id"`
	TeacherID      uuid.UUID      `gorm:"type:uuid;not null" json:"teacher_id"`
	Category       string         `gorm:"type:varchar(50);not null" json:"category"` // academic, behavior, peer, personal
	Content        string         `gorm:"type:text;not null" json:"content"`
	CounselingDate time.Time      `gorm:"not null" json:"counseling_date"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Student User `gorm:"foreignKey:StudentID" json:"student,omitempty"`
	Teacher User `gorm:"foreignKey:TeacherID" json:"teacher,omitempty"`
}

// StudentAbsence represents a student's absence record.
type StudentAbsence struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID    uuid.UUID `gorm:"type:uuid;not null;index" json:"school_id"`
	StudentID   uuid.UUID `gorm:"type:uuid;not null" json:"student_id"`
	AbsenceDate time.Time `gorm:"type:date;not null" json:"absence_date"`
	Reason      string    `gorm:"type:varchar(255)" json:"reason"`
	Approved    bool      `gorm:"default:false" json:"approved"`
	CreatedAt   time.Time `json:"created_at"`

	// Relationships
	Student User `gorm:"foreignKey:StudentID" json:"student,omitempty"`
}
