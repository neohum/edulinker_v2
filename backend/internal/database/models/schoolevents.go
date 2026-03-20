package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SchoolVoting represents a school-wide or class-wide voting event.
type SchoolVoting struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID  uuid.UUID      `gorm:"type:uuid;not null;index" json:"school_id"`
	AuthorID  uuid.UUID      `gorm:"type:uuid;not null" json:"author_id"`
	Title     string         `gorm:"type:varchar(255);not null" json:"title"`
	Content   string         `gorm:"type:text;not null" json:"content"`
	Options   string         `gorm:"type:jsonb;not null" json:"options"` // Array of voting options
	EndsAt    time.Time      `gorm:"not null" json:"ends_at"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Author User `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
}

// EventRecord represents a school event or graduation album log.
type EventRecord struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID  uuid.UUID `gorm:"type:uuid;not null;index" json:"school_id"`
	AuthorID  uuid.UUID `gorm:"type:uuid;not null" json:"author_id"`
	Title     string    `gorm:"type:varchar(255);not null" json:"title"`
	EventType string    `gorm:"type:varchar(50);default:'general'" json:"event_type"` // graduation, festival, general
	MediaURLs string    `gorm:"type:jsonb" json:"media_urls"`                         // Array of URLs to MinIO/S3
	CreatedAt time.Time `json:"created_at"`

	Author User `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
}
