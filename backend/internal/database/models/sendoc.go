package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Sendoc represents an electronic document that may require a signature.
type Sendoc struct {
	ID                uuid.UUID      `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SchoolID          uuid.UUID      `gorm:"type:uuid;not null;index" json:"school_id"`
	AuthorID          uuid.UUID      `gorm:"type:uuid;not null" json:"author_id"`
	Title             string         `gorm:"type:varchar(200);not null" json:"title"`
	Content           string         `gorm:"type:text;not null" json:"content"`             // HTML/Markdown or description
	BackgroundURL     string         `gorm:"type:varchar(500)" json:"background_url"`       // Image path of the document
	FieldsJSON        string         `gorm:"type:jsonb;default:'[]'" json:"fields_json"`    // Coordinates of text/signature fields
	AttachmentFileID  *uuid.UUID     `gorm:"type:uuid" json:"attachment_file_id,omitempty"` // Original PDF/Doc file
	RequiresSignature bool           `gorm:"default:true" json:"requires_signature"`
	Status            string         `gorm:"type:varchar(20);default:'draft'" json:"status"` // draft, sent, completed
	Deadline          *time.Time     `json:"deadline,omitempty"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Author     User              `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
	Recipients []SendocRecipient `gorm:"foreignKey:SendocID;constraint:OnDelete:CASCADE" json:"recipients,omitempty"`
}

// SendocRecipient represents a user who needs to read and optionally sign the document.
type SendocRecipient struct {
	ID                uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SendocID          uuid.UUID  `gorm:"type:uuid;not null;index" json:"sendoc_id"`
	UserID            uuid.UUID  `gorm:"type:uuid;not null" json:"user_id"`
	ReadAt            *time.Time `json:"read_at,omitempty"`
	IsSigned          bool       `gorm:"default:false" json:"is_signed"`
	SignatureImageURL string     `gorm:"type:varchar(255)" json:"signature_image_url,omitempty"` // MinIO path
	FormDataJSON      string     `gorm:"type:jsonb;default:'{}'" json:"form_data_json"`          // Values entered in fields
	SignedAt          *time.Time `json:"signed_at,omitempty"`

	// Relationships
	User   User   `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Sendoc Sendoc `gorm:"foreignKey:SendocID" json:"sendoc,omitempty"`
}
