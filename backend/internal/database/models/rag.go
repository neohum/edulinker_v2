package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// SchoolDocumentChunk stores segments of public school documents for RAG.
type SchoolDocumentChunk struct {
	ID         uuid.UUID       `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID   uuid.UUID       `gorm:"type:uuid;index;not null"`
	SourceType string          `json:"source_type" gorm:"type:varchar(50);index"` // announcement, gatong, curriculum, admission
	SourceID   uuid.UUID       `gorm:"type:uuid;index"`
	Title      string          `json:"title" gorm:"type:varchar(255)"`
	Content    string          `json:"content" gorm:"type:text"`
	Embedding  pq.Float64Array `json:"-" gorm:"type:double precision[]"` // Standard PG array
	Metadata   string          `json:"metadata" gorm:"type:jsonb"`       // Store link, date, etc.
	CreatedAt  time.Time       `json:"created_at" gorm:"autoCreateTime"`
}

// SchoolAIChat stores the conversation history between a parent and the AI assistant.
type SchoolAIChat struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	ParentID  uuid.UUID `json:"parent_id" gorm:"type:uuid;index;not null"`
	SchoolID  uuid.UUID `json:"school_id" gorm:"type:uuid;index;not null"`
	Question  string    `json:"question" gorm:"type:text;not null"`
	Answer    string    `json:"answer" gorm:"type:text;not null"`
	Sources   string    `json:"sources" gorm:"type:jsonb"` // JSON representation of cited sources
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`

	Parent User `json:"-" gorm:"foreignKey:ParentID"`
}
