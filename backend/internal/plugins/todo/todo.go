package todo

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type TodoScope string

const (
	ScopePersonal TodoScope = "personal"
	ScopeSchool   TodoScope = "school"
)

type Todo struct {
	ID                   uuid.UUID  `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID             uuid.UUID  `json:"school_id" gorm:"type:uuid;index"`
	UserID               uuid.UUID  `json:"user_id" gorm:"type:uuid;index"`
	Scope                TodoScope  `json:"scope" gorm:"type:varchar(20);default:'personal'"`
	Title                string     `json:"title" gorm:"type:varchar(200);not null"`
	Description          string     `json:"description,omitempty" gorm:"type:text"`
	IsCompleted          bool       `json:"is_completed" gorm:"default:false"`
	DueDate              *time.Time `json:"due_date,omitempty"`
	LinkedAnnouncementID *uuid.UUID `json:"linked_announcement_id,omitempty" gorm:"type:uuid"`
	Priority             int        `json:"priority" gorm:"default:0"` // 0=normal, 1=high, 2=urgent
	CompletedAt          *time.Time `json:"completed_at,omitempty"`
	CreatedAt            time.Time  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt            time.Time  `json:"updated_at" gorm:"autoUpdateTime"`
}

// ── Plugin ──

type Plugin struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Plugin {
	db.AutoMigrate(&Todo{})
	return &Plugin{db: db}
}

func (p *Plugin) ID() string      { return "todo" }
func (p *Plugin) Name() string    { return "투두리스트" }
func (p *Plugin) Group() string   { return "A" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Get("/", p.listTodos)
	r.Post("/", p.createTodo)
	r.Put("/:id", p.updateTodo)
	r.Put("/:id/toggle", p.toggleTodo)
	r.Delete("/:id", p.deleteTodo)
}

// ── Handlers ──

func (p *Plugin) listTodos(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	scope := c.Query("scope", "all")      // personal, school, all
	status := c.Query("status", "active") // active, completed, all

	query := p.db.Where("(user_id = ? OR (scope = 'school' AND school_id = ?))", userID, schoolID)

	if scope == "personal" {
		query = p.db.Where("user_id = ? AND scope = 'personal'", userID)
	} else if scope == "school" {
		query = p.db.Where("school_id = ? AND scope = 'school'", schoolID)
	}

	if status == "active" {
		query = query.Where("is_completed = false")
	} else if status == "completed" {
		query = query.Where("is_completed = true")
	}

	var todos []Todo
	query.Order("priority DESC, due_date ASC NULLS LAST, created_at DESC").Find(&todos)

	return c.JSON(todos)
}

type CreateTodoRequest struct {
	Title                string     `json:"title"`
	Description          string     `json:"description"`
	Scope                TodoScope  `json:"scope"`
	DueDate              *time.Time `json:"due_date"`
	Priority             int        `json:"priority"`
	LinkedAnnouncementID *uuid.UUID `json:"linked_announcement_id"`
}

func (p *Plugin) createTodo(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req CreateTodoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	if req.Scope == "" {
		req.Scope = ScopePersonal
	}

	todo := Todo{
		SchoolID:             schoolID,
		UserID:               userID,
		Scope:                req.Scope,
		Title:                req.Title,
		Description:          req.Description,
		DueDate:              req.DueDate,
		Priority:             req.Priority,
		LinkedAnnouncementID: req.LinkedAnnouncementID,
	}
	p.db.Create(&todo)

	return c.Status(201).JSON(todo)
}

func (p *Plugin) updateTodo(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid ID"})
	}

	var todo Todo
	if p.db.First(&todo, "id = ?", id).Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "todo not found"})
	}

	var req CreateTodoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	if req.Title != "" {
		todo.Title = req.Title
	}
	if req.Description != "" {
		todo.Description = req.Description
	}
	if req.DueDate != nil {
		todo.DueDate = req.DueDate
	}
	todo.Priority = req.Priority

	p.db.Save(&todo)
	return c.JSON(todo)
}

func (p *Plugin) toggleTodo(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid ID"})
	}

	var todo Todo
	if p.db.First(&todo, "id = ?", id).Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "todo not found"})
	}

	todo.IsCompleted = !todo.IsCompleted
	if todo.IsCompleted {
		now := time.Now()
		todo.CompletedAt = &now
	} else {
		todo.CompletedAt = nil
	}

	p.db.Save(&todo)
	return c.JSON(todo)
}

func (p *Plugin) deleteTodo(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid ID"})
	}

	p.db.Delete(&Todo{}, "id = ?", id)
	return c.JSON(fiber.Map{"message": "deleted"})
}
