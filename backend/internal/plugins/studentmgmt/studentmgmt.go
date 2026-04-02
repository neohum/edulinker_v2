package studentmgmt

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

func (p *Plugin) ID() string      { return "studentmgmt" }
func (p *Plugin) Name() string    { return "학생 상담·결석 기록" }
func (p *Plugin) Group() string   { return "D" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error {
	log.Printf("[StudentMgmt] Enabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) OnDisable(schoolID uuid.UUID) error {
	log.Printf("[StudentMgmt] Disabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) RegisterRoutes(router fiber.Router) {
	// Only accessible to Teachers
	api := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher))

	api.Get("/students/:studentID/counseling", p.listCounselingLogs)
	api.Post("/students/:studentID/counseling", p.addCounselingLog)

	api.Get("/students/:studentID/absences", p.listAbsences)
	api.Post("/students/:studentID/absences", p.addAbsence)
}

func (p *Plugin) listCounselingLogs(c *fiber.Ctx) error {
	studentID := c.Params("studentID")

	var logs []models.StudentCounseling
	if err := p.db.Preload("Teacher").Where("student_id = ?", studentID).Order("counseling_date desc").Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch counseling logs"})
	}

	return c.JSON(logs)
}

func (p *Plugin) addCounselingLog(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	studentUUID, err := uuid.Parse(c.Params("studentID"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	var logEntry models.StudentCounseling
	if err := c.BodyParser(&logEntry); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	logEntry.SchoolID = schoolID
	logEntry.TeacherID = teacherID
	logEntry.StudentID = studentUUID

	if err := p.db.Create(&logEntry).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save counseling log"})
	}

	return c.Status(fiber.StatusCreated).JSON(logEntry)
}

func (p *Plugin) listAbsences(c *fiber.Ctx) error {
	studentID := c.Params("studentID")

	var absences []models.StudentAbsence
	if err := p.db.Where("student_id = ?", studentID).Order("absence_date desc").Find(&absences).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch absences"})
	}

	return c.JSON(absences)
}

func (p *Plugin) addAbsence(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	studentUUID, err := uuid.Parse(c.Params("studentID"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	var absent models.StudentAbsence
	if err := c.BodyParser(&absent); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	absent.SchoolID = schoolID
	absent.StudentID = studentUUID

	if err := p.db.Create(&absent).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save absence record"})
	}

	return c.Status(fiber.StatusCreated).JSON(absent)
}
