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
	Title       string         `gorm:"type:varchar(255);not null" json:"title"`
	Content     string         `gorm:"type:text;not null" json:"content"`
	TargetRoles string         `gorm:"type:text;default:'ALL'" json:"target_roles"`
	Options     string         `gorm:"type:jsonb;not null" json:"options"` // Array of voting options
	StartsAt    time.Time      `gorm:"not null;default:CURRENT_TIMESTAMP" json:"starts_at"`
	EndsAt    time.Time      `gorm:"not null" json:"ends_at"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Author User `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
}

// SchoolVotingResponse represents an individual vote cast by a user.
type SchoolVotingResponse struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	VotingID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_voting_user" json:"voting_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_voting_user" json:"user_id"`
	OptionIdx int       `gorm:"not null" json:"option_idx"`
	ExtraText string    `gorm:"type:text" json:"extra_text,omitempty"`
	CreatedAt time.Time `json:"created_at"`
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
