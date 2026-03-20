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
}

func (p *Plugin) listAnalysisLogs(c *fiber.Ctx) error {
	teacherID := c.Locals("userID").(uuid.UUID)

	var analysisLogs []models.AIAnalysisLog
	if err := p.db.Where("teacher_id = ?", teacherID).Order("created_at desc").Find(&analysisLogs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list ai logs"})
	}

	return c.JSON(analysisLogs)
}

func (p *Plugin) generateAndLogAnalysis(c *fiber.Ctx) error {
	teacherID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var req struct {
		PromptType      string `json:"prompt_type"` // student_evaluation, budget
		InputData       string `json:"input_data"`
		TargetStudentID string `json:"target_student_id,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	// This connects to the AIGateway or Ollama proxy internally
	// For MVP, we save a record simulating a response. The frontend can hit POST /api/core/ai/autocomplete first,
	// and then just save it here, or we can pipe the request in the background. To keep plugins independent,
	// we assume the frontend sends both or we generate a placeholder here if needed.
	// For now, this route is for "saving" the final AI output as a record of evaluation.

	generatedMock := req.InputData + "\n[Ollama/AI 분석 결과 저장됨]"

	alog := models.AIAnalysisLog{
		SchoolID:         schoolID,
		TeacherID:        teacherID,
		PromptType:       req.PromptType,
		InputData:        req.InputData,
		GeneratedContent: generatedMock,
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
