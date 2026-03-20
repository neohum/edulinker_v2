package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TeacherLeaveRecord represents a teacher's absence or tardy record.
type TeacherLeaveRecord struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID  uuid.UUID      `gorm:"type:uuid;not null;index" json:"school_id"`
	TeacherID uuid.UUID      `gorm:"type:uuid;not null" json:"teacher_id"`
	LeaveType string         `gorm:"type:varchar(50);not null" json:"leave_type"` // annual, sick, tardy, business
	StartDate time.Time      `gorm:"not null" json:"start_date"`
	EndDate   time.Time      `gorm:"not null" json:"end_date"`
	Reason    string         `gorm:"type:text" json:"reason"`
	Status    string         `gorm:"type:varchar(20);default:'pending'" json:"status"` // pending, approved, rejected
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Teacher User `gorm:"foreignKey:TeacherID" json:"teacher,omitempty"`
}
