package aianalysis

import (
	"log"

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

func (p *Plugin) ID() string      { return "aianalysis" }
func (p *Plugin) Name() string    { return "AI 세특·종특 분석" }
func (p *Plugin) Group() string   { return "G" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error {
	log.Printf("[AIAnalysis] Enabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) OnDisable(schoolID uuid.UUID) error {
	log.Printf("[AIAnalysis] Disabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) RegisterRoutes(router fiber.Router) {
	// Only accessible to Teachers and Admins
	api := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))

	api.Get("/logs", p.listAnalysisLogs)
	api.Post("/generate", p.generateAndLogAnalysis)
	api.Delete("/logs/:id", p.deleteAnalysisLog)
}

func (p *Plugin) listAnalysisLogs(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var analysisLogs []models.AIAnalysisLog
	if err := p.db.Where("teacher_id = ?", teacherID).Order("created_at desc").Find(&analysisLogs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list ai logs"})
	}

	return c.JSON(analysisLogs)
}

func (p *Plugin) generateAndLogAnalysis(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req struct {
		PromptType       string `json:"prompt_type"`
		InputData        string `json:"input_data"`
		GeneratedContent string `json:"generated_content"`
		TargetStudentID  string `json:"target_student_id,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	alog := models.AIAnalysisLog{
		SchoolID:         schoolID,
		TeacherID:        teacherID,
		PromptType:       req.PromptType,
		InputData:        req.InputData,
		GeneratedContent: req.GeneratedContent,
	}

	if req.TargetStudentID != "" {
		stID, err := uuid.Parse(req.TargetStudentID)
		if err == nil {
			alog.TargetStudentID = &stID
		}
	}

	if err := p.db.Create(&alog).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to log ai analysis"})
	}

	return c.JSON(alog)
}

func (p *Plugin) deleteAnalysisLog(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	logID := c.Params("id")

	var alog models.AIAnalysisLog
	if err := p.db.Where("teacher_id = ? AND id = ?", teacherID, logID).First(&alog).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "log not found"})
	}

	if err := p.db.Delete(&alog).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete ai log"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
