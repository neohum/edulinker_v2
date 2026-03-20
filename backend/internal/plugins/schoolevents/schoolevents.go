package schoolevents

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

func (p *Plugin) ID() string      { return "schoolevents" }
func (p *Plugin) Name() string    { return "학교 행사 및 투표" }
func (p *Plugin) Group() string   { return "H" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error {
	log.Printf("[SchoolEvents] Enabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) OnDisable(schoolID uuid.UUID) error {
	log.Printf("[SchoolEvents] Disabled for school: %s", schoolID)
	return nil
}

// --- SyncProvider Implementation ---
func (p *Plugin) GetSyncData(schoolID string) interface{} {
	var votings []models.SchoolVoting
	p.db.Where("school_id = ?", schoolID).Order("created_at desc").Limit(20).Find(&votings)
	return votings
}

func (p *Plugin) HandleEvent(payload string) error {
	return nil
}

func (p *Plugin) RegisterRoutes(router fiber.Router) {
	api := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin, models.RoleParent, models.RoleStudent))

	api.Get("/votings", p.listVotings)
	api.Get("/records", p.listEventRecords)

	// Write access
	teacherAPI := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))
	teacherAPI.Post("/votings", p.createVoting)
	teacherAPI.Post("/records", p.createEventRecord)

	// Students/Parents voting mock
	api.Post("/votings/:id/vote", p.submitVote)
}

func (p *Plugin) listVotings(c *fiber.Ctx) error {
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var votings []models.SchoolVoting
	if err := p.db.Where("school_id = ?", schoolID).Order("created_at desc").Find(&votings).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list votings"})
	}

	return c.JSON(votings)
}

func (p *Plugin) createVoting(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var vote models.SchoolVoting
	if err := c.BodyParser(&vote); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	vote.SchoolID = schoolID
	vote.AuthorID = userID

	if err := p.db.Create(&vote).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create voting event"})
	}

	return c.Status(fiber.StatusCreated).JSON(vote)
}

func (p *Plugin) submitVote(c *fiber.Ctx) error {
	// Not fully implemented for Phase 3 Week 3, returning MVP mock success
	return c.JSON(fiber.Map{"message": "vote submitted successfully"})
}

func (p *Plugin) listEventRecords(c *fiber.Ctx) error {
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var records []models.EventRecord
	if err := p.db.Where("school_id = ?", schoolID).Order("created_at desc").Find(&records).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list event records"})
	}

	return c.JSON(records)
}

func (p *Plugin) createEventRecord(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var record models.EventRecord
	if err := c.BodyParser(&record); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	record.SchoolID = schoolID
	record.AuthorID = userID

	if err := p.db.Create(&record).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create event record"})
	}

	return c.Status(fiber.StatusCreated).JSON(record)
}
