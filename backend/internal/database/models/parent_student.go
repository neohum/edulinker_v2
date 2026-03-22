package models

import (
	"time"

	"github.com/google/uuid"
)

// ParentStudent stores the relationship between a parent user and a student user.
type ParentStudent struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	ParentID  uuid.UUID `gorm:"type:uuid;not null;index" json:"parent_id"`
	StudentID uuid.UUID `gorm:"type:uuid;not null;index" json:"student_id"`
	SchoolID  uuid.UUID `gorm:"type:uuid;not null;index" json:"school_id"`
	Status    string    `gorm:"type:varchar(20);default:'approved'" json:"status"` // approved, pending
	CreatedAt time.Time `json:"created_at"`

	// Relationships
	Parent  User `gorm:"foreignKey:ParentID" json:"parent,omitempty"`
	Student User `gorm:"foreignKey:StudentID" json:"student,omitempty"`
}
