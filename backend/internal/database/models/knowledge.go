package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type KnowledgeDoc struct {
	ID               uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	SchoolID         uuid.UUID `gorm:"type:uuid;index" json:"school_id"`
	Title            string    `json:"title"`
	SourceType       string    `json:"source_type"` // 'file' | 'text'
	OriginalFilename string    `json:"original_filename"`
	FileURL          string    `json:"file_url"`
	MarkdownContent  string    `json:"markdown_content"`
	CreatedBy        uuid.UUID `gorm:"type:uuid" json:"created_by"`
	CreatedAt        time.Time `json:"created_at"`

	Chunks []KnowledgeChunk `gorm:"foreignKey:DocID;constraint:OnDelete:CASCADE" json:"-"`
	User   *User            `gorm:"foreignKey:CreatedBy" json:"user,omitempty"`
}

type KnowledgeChunk struct {
	ID         uuid.UUID       `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	DocID      uuid.UUID       `gorm:"type:uuid;index" json:"doc_id"`
	ChunkIndex int             `json:"chunk_index"`
	ChunkText  string          `json:"chunk_text"`
	Embedding  pq.Float64Array `gorm:"type:float8[]" json:"embedding"`
	CreatedAt  time.Time       `json:"created_at"`
}
