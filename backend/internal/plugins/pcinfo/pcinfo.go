package pcinfo

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type PCRecord struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID   uuid.UUID `json:"school_id" gorm:"type:uuid;index"`
	UserID     uuid.UUID `json:"user_id" gorm:"type:uuid;index"`
	Hostname   string    `json:"hostname" gorm:"type:varchar(100)"`
	IPAddress  string    `json:"ip_address" gorm:"type:varchar(50)"`
	MACAddress string    `json:"mac_address" gorm:"type:varchar(50)"`
	OS         string    `json:"os" gorm:"type:varchar(100)"`
	CPU        string    `json:"cpu" gorm:"type:varchar(200)"`
	RAM        string    `json:"ram" gorm:"type:varchar(50)"`
	Disk       string    `json:"disk" gorm:"type:varchar(100)"`
	Location   string    `json:"location" gorm:"type:varchar(100)"` // e.g. "3학년 1반"
	Label      string    `json:"label" gorm:"type:varchar(100)"`    // sticker label
	LastSeen   time.Time `json:"last_seen" gorm:"autoUpdateTime"`
	CreatedAt  time.Time `json:"created_at" gorm:"autoCreateTime"`
}

// ── Plugin ──

type Plugin struct{ db *gorm.DB }

func New(db *gorm.DB) *Plugin {
	db.AutoMigrate(&PCRecord{})
	return &Plugin{db: db}
}

func (p *Plugin) ID() string                         { return "pcinfo" }
func (p *Plugin) Name() string                       { return "pc-info" }
func (p *Plugin) Group() string                      { return "I" }
func (p *Plugin) Version() string                    { return "1.0.0" }
func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Post("/report", p.report)
	r.Get("/", p.list)
	r.Get("/:id", p.getOne)
	r.Put("/:id/label", p.setLabel)
}

func (p *Plugin) report(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var rec PCRecord
	if err := c.BodyParser(&rec); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	rec.UserID = userID
	rec.SchoolID = schoolID

	// Upsert based on MAC address
	var existing PCRecord
	if p.db.Where("school_id = ? AND mac_address = ?", schoolID, rec.MACAddress).First(&existing).Error == nil {
		rec.ID = existing.ID
		p.db.Save(&rec)
	} else {
		p.db.Create(&rec)
	}

	return c.JSON(rec)
}

func (p *Plugin) list(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	location := c.Query("location", "")

	query := p.db.Where("school_id = ?", schoolID)
	if location != "" {
		query = query.Where("location = ?", location)
	}

	var records []PCRecord
	query.Order("location ASC, label ASC").Find(&records)
	return c.JSON(records)
}

func (p *Plugin) getOne(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	var rec PCRecord
	if p.db.First(&rec, "id = ?", id).Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(rec)
}

func (p *Plugin) setLabel(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	var req struct {
		Label    string `json:"label"`
		Location string `json:"location"`
	}
	c.BodyParser(&req)
	p.db.Model(&PCRecord{}).Where("id = ?", id).Updates(map[string]interface{}{
		"label": req.Label, "location": req.Location,
	})
	return c.JSON(fiber.Map{"message": "updated"})
}
