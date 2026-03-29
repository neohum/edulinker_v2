package models

import (
	"time"

	"github.com/google/uuid"
)

// KnowledgeDoc: 서버는 문서 원본만 저장
// 임베딩/청킹은 교사 PC(Wails + SQLite)에서 처리
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

	User *User `gorm:"foreignKey:CreatedBy" json:"user,omitempty"`
}
