package studentalert

import (
	"time"

	"github.com/edulinker/backend/internal/core/notify"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type Alert struct {
	ID        uuid.UUID  `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID  uuid.UUID  `json:"school_id" gorm:"type:uuid;index"`
	TeacherID uuid.UUID  `json:"teacher_id" gorm:"type:uuid"`
	Title     string     `json:"title" gorm:"type:varchar(200);not null"`
	Content   string     `json:"content" gorm:"type:text"`
	Category  string     `json:"category" gorm:"type:varchar(50);default:'general'"` // safety, general, event
	IsActive  bool       `json:"is_active" gorm:"default:true"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at" gorm:"autoCreateTime"`
}

// ── Plugin ──

type Plugin struct {
	db        *gorm.DB
	notifySvc *notify.NotificationService
}

func New(db *gorm.DB, notifySvc *notify.NotificationService) *Plugin {
	db.AutoMigrate(&Alert{})
	return &Plugin{db: db, notifySvc: notifySvc}
}

func (p *Plugin) ID() string                         { return "student-alert" }
func (p *Plugin) Name() string                       { return "학생 알림 서비스" }
func (p *Plugin) Group() string                      { return "A" }
func (p *Plugin) Version() string                    { return "1.0.0" }
func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Get("/", p.listAlerts)
	r.Post("/", p.createAlert)
	r.Put("/:id", p.updateAlert)
	r.Delete("/:id", p.deleteAlert)
	r.Get("/active", p.getActiveAlerts)
}

func (p *Plugin) listAlerts(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	var alerts []Alert
	p.db.Where("school_id = ?", schoolID).Order("created_at DESC").Find(&alerts)
	return c.JSON(alerts)
}

func (p *Plugin) createAlert(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req struct {
		Title     string     `json:"title"`
		Content   string     `json:"content"`
		Category  string     `json:"category"`
		ExpiresAt *time.Time `json:"expires_at"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	alert := Alert{
		SchoolID:  schoolID,
		TeacherID: userID,
		Title:     req.Title,
		Content:   req.Content,
		Category:  req.Category,
		ExpiresAt: req.ExpiresAt,
	}
	p.db.Create(&alert)

	// Notify students via SSE/WS
	if p.notifySvc != nil {
		p.notifySvc.Send(notify.SendRequest{
			SchoolID: schoolID,
			PluginID: "student-alert",
			Type:     notify.NotifyInfo,
			Title:    alert.Title,
			Body:     alert.Content,
			Roles:    []string{"student"},
		})
	}

	return c.Status(201).JSON(alert)
}

func (p *Plugin) updateAlert(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	var alert Alert
	if p.db.First(&alert, "id = ?", id).Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	c.BodyParser(&alert)
	p.db.Save(&alert)
	return c.JSON(alert)
}

func (p *Plugin) deleteAlert(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	p.db.Delete(&Alert{}, "id = ?", id)
	return c.JSON(fiber.Map{"message": "deleted"})
}

func (p *Plugin) getActiveAlerts(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	var alerts []Alert
	p.db.Where("school_id = ? AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())", schoolID).
		Order("created_at DESC").Find(&alerts)
	return c.JSON(alerts)
}
