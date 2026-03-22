package rag

import (
	"fmt"

	"github.com/edulinker/backend/internal/core/aigateway"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"gorm.io/gorm"
)

type Service struct {
	db    *gorm.DB
	aiSvc *aigateway.Service
	model string // embedding model
}

func NewService(db *gorm.DB, aiSvc *aigateway.Service) *Service {
	return &Service{
		db:    db,
		aiSvc: aiSvc,
		model: "bge-m3",
	}
}

func (s *Service) IndexDocument(schoolID uuid.UUID, sourceType string, sourceID uuid.UUID, title string, content string, metadata string) error {
	// Simple chunking for now
	chunkContent := content
	if len(chunkContent) > 2000 {
		chunkContent = chunkContent[:2000]
	}

	emb, err := s.aiSvc.Embed(s.model, chunkContent)
	if err != nil {
		return fmt.Errorf("failed to generate embedding: %w", err)
	}

	// Convert []float32 to []float64 for pq.Float64Array
	emb64 := make([]float64, len(emb))
	for i, v := range emb {
		emb64[i] = float64(v)
	}

	chunk := models.SchoolDocumentChunk{
		SchoolID:   schoolID,
		SourceType: sourceType,
		SourceID:   sourceID,
		Title:      title,
		Content:    chunkContent,
		Embedding:  pq.Float64Array(emb64),
		Metadata:   metadata,
	}

	return s.db.Create(&chunk).Error
}

func (s *Service) Query(schoolID uuid.UUID, question string) (string, []models.SchoolDocumentChunk, error) {
	// 1. Embed question
	emb, err := s.aiSvc.Embed(s.model, question)
	if err != nil {
		return "", nil, err
	}

	emb64 := make([]float64, len(emb))
	for i, v := range emb {
		emb64[i] = float64(v)
	}

	// 2. Search using dot product via SQL (approximation of similarity)
	// PostgreSQL array logic: we can use a custom function or simple unnest logic
	// For efficiency without pgvector, we use a simple cosine similarity simulation in SQL:
	// similarity = (A . B) / (|A| * |B|)
	// Since embeddings are often normalized, dot product (A . B) is sufficient.
	
	var chunks []models.SchoolDocumentChunk
	
	// Convert Go slice to Postgres array string format: '{0.1, 0.2, ...}'
	pgArray := "ARRAY["
	for i, v := range emb64 {
		if i > 0 {
			pgArray += ","
		}
		pgArray += fmt.Sprintf("%f", v)
	}
	pgArray += "]::double precision[]"

	// SQL to calculate dot product between two arrays
	// We use a subquery to calculate dot product for each row
	dotProductSQL := fmt.Sprintf(`
		(SELECT SUM(a*b) FROM UNNEST(embedding) WITH ORDINALITY AS x(a, i) 
		 JOIN UNNEST(%s) WITH ORDINALITY AS y(b, j) ON i = j)`, pgArray)

	err = s.db.Where("school_id = ?", schoolID).
		Select("*, " + dotProductSQL + " as score").
		Order("score DESC").
		Limit(3).
		Find(&chunks).Error

	if err != nil {
		return "", nil, err
	}

	if len(chunks) == 0 {
		return "관련 정보를 찾을 수 없습니다.", nil, nil
	}

	// 3. Build Context
	context := ""
	for _, c := range chunks {
		context += fmt.Sprintf("[%s] %s\n", c.Title, c.Content)
	}

	prompt := fmt.Sprintf(`당신은 학교 정보를 안내해주는 AI 어시스턴트입니다. 아래 제공된 학교 공지사항 내용을 바탕으로 학부모님의 질문에 친절하게 답변해주세요.
정보가 부족하다면 추측하지 말고 모른다고 답변하세요.

[학교 공지 내용]
%s

[학부모 질문]
%s

친절하고 명확한 한국어로 답변해주세요.`, context, question)

	answer, err := s.aiSvc.GenerateAnswer("exaone3.5", prompt)
	return answer, chunks, err
}
