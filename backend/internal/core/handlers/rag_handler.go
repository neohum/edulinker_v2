package handlers

import (
	"encoding/json"

	"github.com/edulinker/backend/internal/core/rag"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RAGHandler struct {
	db     *gorm.DB
	ragSvc *rag.Service
}

func NewRAGHandler(db *gorm.DB, ragSvc *rag.Service) *RAGHandler {
	return &RAGHandler{
		db:     db,
		ragSvc: ragSvc,
	}
}

// Query handles parent questions and saves to history.
// POST /api/parent/ai/query
func (h *RAGHandler) Query(c *fiber.Ctx) error {
	parentID, _ := c.Locals("userID").(uuid.UUID)
	var req struct {
		Question string    `json:"question"`
		SchoolID uuid.UUID `json:"school_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if req.Question == "" || req.SchoolID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "question and school_id are required"})
	}

	answer, chunks, err := h.ragSvc.Query(req.SchoolID, req.Question)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}

	sources := []fiber.Map{}
	for _, chunk := range chunks {
		sources = append(sources, fiber.Map{
			"title":       chunk.Title,
			"source_type": chunk.SourceType,
			"source_id":   chunk.SourceID,
		})
	}

	// Save to history
	sourcesJSON, _ := json.Marshal(sources)
	history := models.SchoolAIChat{
		ParentID: parentID,
		SchoolID: req.SchoolID,
		Question: req.Question,
		Answer:   answer,
		Sources:  string(sourcesJSON),
	}
	h.db.Create(&history)

	return c.JSON(fiber.Map{
		"id":      history.ID,
		"answer":  answer,
		"sources": sources,
	})
}

// GetHistory returns the chat history for the parent.
// GET /api/parent/ai/history?school_id=
func (h *RAGHandler) GetHistory(c *fiber.Ctx) error {
	parentID, _ := c.Locals("userID").(uuid.UUID)
	schoolIDStr := c.Query("school_id")
	if schoolIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school_id query param is required"})
	}
	schoolID, _ := uuid.Parse(schoolIDStr)

	var history []models.SchoolAIChat
	h.db.Where("parent_id = ? AND school_id = ?", parentID, schoolID).
		Order("created_at desc").
		Limit(50).
		Find(&history)

	return c.JSON(history)
}
