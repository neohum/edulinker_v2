package schooladmin

import (
	"github.com/edulinker/backend/internal/core/middleware"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Plugin struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Plugin {
	return &Plugin{db: db}
}

func (p *Plugin) ID() string      { return "schooladmin" }
func (p *Plugin) Name() string    { return "행정 및 인사 관리" }
func (p *Plugin) Group() string   { return "C" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	auth := r.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))

	// Task Handover
	auth.Post("/handovers", p.createHandover)
	auth.Get("/handovers/received", p.listReceivedHandovers)
	auth.Put("/handovers/:id/confirm", p.confirmHandover)

	// Multi-Evaluation (Restricted access logic)
	auth.Post("/evaluations", p.submitEvaluation)
	auth.Get("/evaluations/target/:teacherID", p.listEvaluationsForTeacher)
}

func (p *Plugin) createHandover(c *fiber.Ctx) error {
	fromUserID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var handover models.TaskHandover
	if err := c.BodyParser(&handover); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	handover.FromUserID = fromUserID
	handover.SchoolID = schoolID
	p.db.Create(&handover)
	return c.Status(201).JSON(handover)
}

func (p *Plugin) listReceivedHandovers(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	var handovers []models.TaskHandover
	p.db.Preload("FromUser").Where("to_user_id = ?", userID).Find(&handovers)
	return c.JSON(handovers)
}

func (p *Plugin) confirmHandover(c *fiber.Ctx) error {
	id := c.Params("id")
	userID := c.Locals("userID").(uuid.UUID)
	if err := p.db.Model(&models.TaskHandover{}).Where("id = ? AND to_user_id = ?", id, userID).Update("is_confirmed", true).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to confirm"})
	}
	return c.JSON(fiber.Map{"status": "confirmed"})
}

func (p *Plugin) submitEvaluation(c *fiber.Ctx) error {
	evaluatorID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var eval models.MultiEvaluation
	if err := c.BodyParser(&eval); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	eval.EvaluatorID = evaluatorID
	eval.SchoolID = schoolID
	p.db.Create(&eval)
	return c.Status(201).JSON(eval)
}

func (p *Plugin) listEvaluationsForTeacher(c *fiber.Ctx) error {
	// Simple authorization: only Admins or designated evaluators (logic can be expanded)
	role := c.Locals("role").(string)
	if role != string(models.RoleAdmin) {
		return c.Status(403).JSON(fiber.Map{"error": "인사 자료는 관리자만 열람할 수 있습니다."})
	}

	teacherID := c.Params("teacherID")
	var evals []models.MultiEvaluation
	p.db.Where("target_teacher_id = ?", teacherID).Find(&evals)
	return c.JSON(evals)
}
