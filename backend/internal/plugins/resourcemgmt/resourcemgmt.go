package resourcemgmt

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

func (p *Plugin) ID() string      { return "resourcemgmt" }
func (p *Plugin) Name() string    { return "특별실 및 자원 관리" }
func (p *Plugin) Group() string   { return "I" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	// Public (Read only) - for students/parents location info
	r.Get("/facilities", p.listFacilities)

	// Teacher/Admin (Write/Reserve)
	auth := r.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))
	auth.Post("/facilities", p.addFacility)
	auth.Post("/reservations", p.reserveFacility)
	auth.Get("/reservations", p.listReservations)
}

func (p *Plugin) listFacilities(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var facilities []models.Facility
	p.db.Where("school_id = ?", schoolID).Find(&facilities)
	return c.JSON(facilities)
}

func (p *Plugin) addFacility(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var facility models.Facility
	if err := c.BodyParser(&facility); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	facility.SchoolID = schoolID
	p.db.Create(&facility)
	return c.Status(201).JSON(facility)
}

func (p *Plugin) reserveFacility(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var res models.FacilityReservation
	if err := c.BodyParser(&res); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	res.TeacherID = teacherID
	// TODO: Check for double booking
	p.db.Create(&res)
	return c.Status(201).JSON(res)
}

func (p *Plugin) listReservations(c *fiber.Ctx) error {
	var reservations []models.FacilityReservation
	p.db.Preload("Facility").Order("start_time asc").Find(&reservations)
	return c.JSON(reservations)
}
