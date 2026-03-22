package linker

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type Bookmark struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID   uuid.UUID `json:"school_id" gorm:"type:uuid;index"`
	UserID     uuid.UUID `json:"user_id" gorm:"type:uuid;index"`
	Title      string    `json:"title" gorm:"type:varchar(100);not null"`
	URL        string    `json:"url" gorm:"type:varchar(500);not null"`
	StudentURL string    `json:"student_url" gorm:"type:varchar(500);default:''"` // separate URL shown to students
	Icon       string    `json:"icon,omitempty" gorm:"type:varchar(100)"`
	Category   string    `json:"category" gorm:"type:varchar(50);default:'general'"`
	SortOrder  int       `json:"sort_order" gorm:"default:0"`
	IsShared   bool      `json:"is_shared" gorm:"default:false"` // shared with students
	CreatedAt  time.Time `json:"created_at" gorm:"autoCreateTime"`
}

// ── Plugin ──

type Plugin struct{ db *gorm.DB }

func New(db *gorm.DB) *Plugin {
	db.AutoMigrate(&Bookmark{})
	return &Plugin{db: db}
}

func (p *Plugin) ID() string                         { return "linker" }
func (p *Plugin) Name() string                       { return "linker" }
func (p *Plugin) Group() string                      { return "I" }
func (p *Plugin) Version() string                    { return "1.0.0" }
func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Get("/", p.list)
	r.Post("/", p.create)
	r.Put("/:id", p.update)
	r.Delete("/:id", p.remove)
	r.Put("/reorder", p.reorder)
}

// RegisterPublicRoutes registers unauthenticated routes (called from api-server for student access)
func (p *Plugin) RegisterPublicRoutes(r fiber.Router) {
	r.Get("/shared/:schoolCode", p.listSharedPublic)
}

// BookmarkWithOwner wraps Bookmark with an extra is_own flag for the teacher UI
type BookmarkWithOwner struct {
	Bookmark
	IsOwn bool `json:"is_own"`
}

func (p *Plugin) list(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var bookmarks []Bookmark
	p.db.Where("user_id = ? OR (school_id = ? AND is_shared = true)", userID, schoolID).
		Order("sort_order ASC").Find(&bookmarks)

	result := make([]BookmarkWithOwner, len(bookmarks))
	for i, bm := range bookmarks {
		result[i] = BookmarkWithOwner{Bookmark: bm, IsOwn: bm.UserID == userID}
	}
	return c.JSON(result)
}

// listSharedPublic returns all is_shared bookmarks for a school, identified by school code
func (p *Plugin) listSharedPublic(c *fiber.Ctx) error {
	schoolCode := c.Params("schoolCode")
	if schoolCode == "" {
		return c.Status(400).JSON(fiber.Map{"error": "school code required"})
	}
	// Find school by code
	var school struct {
		ID uuid.UUID
	}
	if err := p.db.Table("schools").Select("id").Where("code = ?", schoolCode).First(&school).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "school not found"})
	}
	var bookmarks []Bookmark
	p.db.Where("school_id = ? AND is_shared = true", school.ID).Order("sort_order ASC").Find(&bookmarks)
	return c.JSON(bookmarks)
}

func (p *Plugin) create(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var bm Bookmark
	if err := c.BodyParser(&bm); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	bm.UserID = userID
	bm.SchoolID = schoolID
	p.db.Create(&bm)
	return c.Status(201).JSON(bm)
}

func (p *Plugin) update(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	var bm Bookmark
	if p.db.First(&bm, "id = ?", id).Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	c.BodyParser(&bm)
	p.db.Save(&bm)
	return c.JSON(bm)
}

func (p *Plugin) remove(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	p.db.Delete(&Bookmark{}, "id = ?", id)
	return c.JSON(fiber.Map{"message": "deleted"})
}

func (p *Plugin) reorder(c *fiber.Ctx) error {
	var items []struct {
		ID    uuid.UUID `json:"id"`
		Order int       `json:"sort_order"`
	}
	if err := c.BodyParser(&items); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	for _, item := range items {
		p.db.Model(&Bookmark{}).Where("id = ?", item.ID).Update("sort_order", item.Order)
	}
	return c.JSON(fiber.Map{"message": "reordered"})
}
