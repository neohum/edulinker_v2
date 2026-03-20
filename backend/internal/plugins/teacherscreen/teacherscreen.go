package teacherscreen

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type ScreenConfig struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID  uuid.UUID `json:"school_id" gorm:"type:uuid;index"`
	TeacherID uuid.UUID `json:"teacher_id" gorm:"type:uuid;index;uniqueIndex:idx_teacher_screen"`
	ClassName string    `json:"class_name" gorm:"type:varchar(50)"`      // e.g. "3학년 1반"
	Services  string    `json:"services" gorm:"type:jsonb;default:'[]'"` // JSON array of enabled service IDs
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
}

// ── Plugin ──

type Plugin struct{ db *gorm.DB }

func New(db *gorm.DB) *Plugin {
	db.AutoMigrate(&ScreenConfig{})
	return &Plugin{db: db}
}

func (p *Plugin) ID() string                         { return "teacher-screen" }
func (p *Plugin) Name() string                       { return "교사화면 설정" }
func (p *Plugin) Group() string                      { return "I" }
func (p *Plugin) Version() string                    { return "1.0.0" }
func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Get("/", p.getConfig)
	r.Put("/", p.saveConfig)
	r.Get("/class/:className", p.getByClass)
}

func (p *Plugin) getConfig(c *fiber.Ctx) error {
	teacherID, _ := c.Locals("userID").(uuid.UUID)

	var cfg ScreenConfig
	if p.db.Where("teacher_id = ?", teacherID).First(&cfg).Error != nil {
		return c.JSON(fiber.Map{"services": []string{}, "class_name": ""})
	}
	return c.JSON(cfg)
}

func (p *Plugin) saveConfig(c *fiber.Ctx) error {
	teacherID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req struct {
		ClassName string `json:"class_name"`
		Services  string `json:"services"` // JSON array
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	var cfg ScreenConfig
	result := p.db.Where("teacher_id = ?", teacherID).First(&cfg)
	if result.Error != nil {
		cfg = ScreenConfig{
			SchoolID:  schoolID,
			TeacherID: teacherID,
			ClassName: req.ClassName,
			Services:  req.Services,
		}
		p.db.Create(&cfg)
	} else {
		cfg.ClassName = req.ClassName
		cfg.Services = req.Services
		p.db.Save(&cfg)
	}

	return c.JSON(cfg)
}

func (p *Plugin) getByClass(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	className := c.Params("className")

	var configs []ScreenConfig
	p.db.Where("school_id = ? AND class_name = ?", schoolID, className).Find(&configs)
	return c.JSON(configs)
}
