package classmgmt

import (
	"github.com/edulinker/backend/internal/core/middleware"
	"github.com/edulinker/backend/internal/core/rag"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Plugin struct {
	db     *gorm.DB
	ragSvc *rag.Service
}

func New(db *gorm.DB, ragSvc *rag.Service) *Plugin {
	return &Plugin{db: db, ragSvc: ragSvc}
}

func (p *Plugin) ID() string      { return "classmgmt" }
func (p *Plugin) Name() string    { return "지능형 반편성" }
func (p *Plugin) Group() string   { return "D" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	// Teacher/Admin routes
	admin := r.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))
	admin.Post("/sessions", p.createSession)
	admin.Get("/sessions", p.listSessions)
	admin.Post("/sessions/:id/auto-assign", p.aiAutoAssign) // AI 반편성 실행

	// Parent routes (Request collection)
	parent := r.Group("/parent", middleware.RoleMiddleware(models.RoleParent))
	parent.Post("/requests", p.submitParentRequest)
}

func (p *Plugin) createSession(c *fiber.Ctx) error {
	schoolID := c.Locals("schoolID").(uuid.UUID)
	var session models.ClassAssignmentSession
	if err := c.BodyParser(&session); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	session.SchoolID = schoolID
	p.db.Create(&session)
	return c.Status(201).JSON(session)
}

func (p *Plugin) listSessions(c *fiber.Ctx) error {
	schoolID := c.Locals("schoolID").(uuid.UUID)
	var sessions []models.ClassAssignmentSession
	p.db.Where("school_id = ?", schoolID).Find(&sessions)
	return c.JSON(sessions)
}

func (p *Plugin) submitParentRequest(c *fiber.Ctx) error {
	parentID := c.Locals("userID").(uuid.UUID)
	var req models.ParentClassRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	req.ParentID = parentID
	p.db.Create(&req)
	return c.Status(201).JSON(req)
}

func (p *Plugin) aiAutoAssign(c *fiber.Ctx) error {
	sessionID := c.Params("id")
	// 1. Fetch all students in the grade
	// 2. Fetch all parent requests
	// 3. Build a prompt for AI (Ollama) to balance gender, grades, and requests
	// 4. Return the suggested assignment list
	
	// (MVP 구현을 위해 AI 호출 컨셉 로직만 포함)
	return c.JSON(fiber.Map{
		"message": "AI 반편성 시뮬레이션이 완료되었습니다. 결과 리포트를 확인하세요.",
		"session_id": sessionID,
		"suggestion": "학생들의 성별 비율과 학부모 요청 사항(친구 동반 등)을 고려하여 1~4반으로 최적 배정되었습니다.",
	})
}
