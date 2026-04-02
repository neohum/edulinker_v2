package curriculum

import (
	"fmt"
	"log"

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

func (p *Plugin) ID() string      { return "curriculum" }
func (p *Plugin) Name() string    { return "주간학습 및 수행평가" }
func (p *Plugin) Group() string   { return "E" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error {
	log.Printf("[Curriculum] Enabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) OnDisable(schoolID uuid.UUID) error {
	log.Printf("[Curriculum] Disabled for school: %s", schoolID)
	return nil
}

// --- SyncProvider Implementation ---
func (p *Plugin) GetSyncData(schoolID string) interface{} {
	var plans []models.WeeklyStudyPlan
	p.db.Preload("Teacher").Where("school_id = ?", schoolID).Order("week_start desc").Limit(10).Find(&plans)
	return plans
}

func (p *Plugin) HandleEvent(payload string) error {
	return nil
}

func (p *Plugin) RegisterRoutes(router fiber.Router) {
	// Read operations broadly accessible
	api := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleParent, models.RoleStudent, models.RoleAdmin))
	api.Get("/weekly-plans", p.listWeeklyPlans)

	// Write operations restricted to Teachers
	teacherAPI := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))
	teacherAPI.Post("/weekly-plans", p.createWeeklyPlan)
	teacherAPI.Get("/evaluations", p.listEvaluations)
	teacherAPI.Post("/evaluations", p.createEvaluation)
}

func (p *Plugin) listWeeklyPlans(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var plans []models.WeeklyStudyPlan
	if err := p.db.Preload("Teacher").Where("school_id = ?", schoolID).Order("week_start desc").Find(&plans).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list weekly plans"})
	}

	return c.JSON(plans)
}

func (p *Plugin) createWeeklyPlan(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var plan models.WeeklyStudyPlan
	if err := c.BodyParser(&plan); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	plan.SchoolID = schoolID
	plan.TeacherID = teacherID

	if err := p.db.Create(&plan).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save weekly plan"})
	}

	// Index for RAG
	if p.ragSvc != nil {
		title := fmt.Sprintf("%s 주간학습안내: %s", plan.WeekStart.Format("2006-01-02"), plan.Title)
		go p.ragSvc.IndexDocument(schoolID, "curriculum", plan.ID, title, plan.Content, "")
	}

	return c.Status(fiber.StatusCreated).JSON(plan)
}

func (p *Plugin) listEvaluations(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var evals []models.EvaluationRecord
	if err := p.db.Preload("Student").Where("teacher_id = ?", teacherID).Order("created_at desc").Find(&evals).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list evaluations"})
	}

	return c.JSON(evals)
}

func (p *Plugin) createEvaluation(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var eval models.EvaluationRecord
	if err := c.BodyParser(&eval); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	eval.SchoolID = schoolID
	eval.TeacherID = teacherID

	if err := p.db.Create(&eval).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create evaluation record"})
	}

	return c.Status(fiber.StatusCreated).JSON(eval)
}
