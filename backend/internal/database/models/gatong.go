package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Gatong represents a family correspondence (가정통신문), notice, or survey sent to parents/students.
type Gatong struct {
	ID         uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"school_id"`
	AuthorID   uuid.UUID      `gorm:"type:uuid;not null" json:"author_id"`
	Title      string         `gorm:"type:varchar(200);not null" json:"title"`
	Content    string         `gorm:"type:text;not null" json:"content"`
	Type       string         `gorm:"type:varchar(20);not null" json:"type"` // notice, survey, consent
	IsRequired bool           `gorm:"default:false" json:"is_required"`
	Deadline   *time.Time     `json:"deadline,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Author    User             `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
	Targets   []GatongTarget   `gorm:"foreignKey:GatongID;constraint:OnDelete:CASCADE" json:"targets,omitempty"`
	Responses []GatongResponse `gorm:"foreignKey:GatongID;constraint:OnDelete:CASCADE" json:"responses,omitempty"`
}

// GatongTarget represents the recipients of a Gatong.
type GatongTarget struct {
	ID           uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	GatongID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"gatong_id"`
	TargetRole   Role       `gorm:"type:varchar(20);not null" json:"target_role"` // e.g., parent, student, all
	TargetUserID *uuid.UUID `gorm:"type:uuid" json:"target_user_id,omitempty"`    // null means whole role targeting
	ReadAt       *time.Time `json:"read_at,omitempty"`
}

// GatongResponse represents a parent's or student's response (e.g., survey answers, consent signature).
type GatongResponse struct {
	ID           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	GatongID     uuid.UUID `gorm:"type:uuid;not null;index" json:"gatong_id"`
	UserID       uuid.UUID `gorm:"type:uuid;not null" json:"user_id"`
	ResponseData string    `gorm:"type:jsonb" json:"response_data,omitempty"`        // JSON string for survey answers
	SignatureURL string    `gorm:"type:varchar(255)" json:"signature_url,omitempty"` // path to signature image
	RespondedAt  time.Time `gorm:"autoCreateTime" json:"responded_at"`

	// Relationships
	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
