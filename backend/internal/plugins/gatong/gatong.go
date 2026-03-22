package gatong

import (
	"log"
	"time"

	"github.com/edulinker/backend/internal/core/middleware"
	"github.com/edulinker/backend/internal/core/notify"
	"github.com/edulinker/backend/internal/core/rag"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Plugin struct {
	db        *gorm.DB
	notifySvc *notify.NotificationService
	ragSvc    *rag.Service
}

func New(db *gorm.DB, notifySvc *notify.NotificationService, ragSvc *rag.Service) *Plugin {
	return &Plugin{db: db, notifySvc: notifySvc, ragSvc: ragSvc}
}

func (p *Plugin) ID() string      { return "gatong" }
func (p *Plugin) Name() string    { return "가정통신문(가통)" }
func (p *Plugin) Group() string   { return "A" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error {
	log.Printf("[Gatong] Enabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) OnDisable(schoolID uuid.UUID) error {
	log.Printf("[Gatong] Disabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) RegisterRoutes(router fiber.Router) {
	// Teacher endpoints (Write access)
	teacherAPI := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher))
	teacherAPI.Post("/", p.createGatong)
	teacherAPI.Get("/", p.listGatongs)
	teacherAPI.Get("/:id/responses", p.getResponses)

	// Parent/Student endpoints (Read access)
	viewerAPI := router.Group("/view", middleware.RoleMiddleware(models.RoleParent, models.RoleStudent))
	viewerAPI.Get("/", p.listGatongsForUser)
	viewerAPI.Post("/:id/respond", p.submitResponse)
	viewerAPI.Post("/:id/add-to-todo", p.addToTodo) // 신규: 가통 내용을 할 일로 등록
}

func (p *Plugin) addToTodo(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	gatongID := c.Params("id")

	var gatong models.Gatong
	if err := p.db.First(&gatong, "id = ?", gatongID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "가정통신문을 찾을 수 없습니다."})
	}

	// Create a new Todo record for the user (using todo plugin's model structure concept)
	// Note: We'll direct-save to the todos table since we share the DB
	todo := map[string]interface{}{
		"id":         uuid.New(),
		"user_id":    userID,
		"school_id":  gatong.SchoolID,
		"title":      "[가통] " + gatong.Title,
		"content":    gatong.Content,
		"is_done":    false,
		"created_at": time.Now(),
	}

	if err := p.db.Table("todos").Create(&todo).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "할 일 등록에 실패했습니다."})
	}

	return c.JSON(fiber.Map{"message": "나의 할 일(Todo)에 등록되었습니다."})
}

// Handlers

func (p *Plugin) createGatong(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var req struct {
		Title      string                `json:"title"`
		Content    string                `json:"content"`
		Type       string                `json:"type"` // notice, survey, consent
		IsRequired bool                  `json:"is_required"`
		Targets    []models.GatongTarget `json:"targets"` // roles to target
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	gatong := models.Gatong{
		SchoolID:   schoolID,
		AuthorID:   userID,
		Title:      req.Title,
		Content:    req.Content,
		Type:       req.Type,
		IsRequired: req.IsRequired,
		Targets:    req.Targets,
	}

	if err := p.db.Create(&gatong).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create gatong"})
	}

	// Index for RAG
	if p.ragSvc != nil {
		go p.ragSvc.IndexDocument(schoolID, "gatong", gatong.ID, gatong.Title, gatong.Content, "")
	}

	// Send notification using the notification service
	for _, target := range req.Targets {
		// Example: send targeted notifications.
		// In a real app we would query users based on target.TargetRole and target.TargetUserID
		log.Printf("[Gatong] Notifying %v about new Gatong: %s", target.TargetRole, gatong.Title)
	}

	return c.Status(fiber.StatusCreated).JSON(gatong)
}

func (p *Plugin) listGatongs(c *fiber.Ctx) error {
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var gatongs []models.Gatong
	if err := p.db.Preload("Targets").Preload("Author").Where("school_id = ?", schoolID).Order("created_at desc").Find(&gatongs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list"})
	}

	return c.JSON(gatongs)
}

func (p *Plugin) getResponses(c *fiber.Ctx) error {
	gatongID := c.Params("id")

	var responses []models.GatongResponse
	if err := p.db.Preload("User").Where("gatong_id = ?", gatongID).Find(&responses).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get responses"})
	}

	return c.JSON(responses)
}

func (p *Plugin) listGatongsForUser(c *fiber.Ctx) error {
	schoolID := c.Locals("schoolID").(uuid.UUID)
	role := c.Locals("role").(string)
	userID := c.Locals("userID").(uuid.UUID)

	var gatongs []models.Gatong

	// Complex query: Gatongs for this school where TargetRole = role OR TargetUserID = userID
	err := p.db.Joins("JOIN gatong_targets gt ON gt.gatong_id = gatongs.id").
		Where("gatongs.school_id = ?", schoolID).
		Where("gt.target_role = ? OR gt.target_user_id = ?", role, userID).
		Preload("Author").
		Group("gatongs.id").
		Order("created_at desc").
		Find(&gatongs).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch gatongs"})
	}

	return c.JSON(gatongs)
}

func (p *Plugin) submitResponse(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	gatongID := c.Params("id")

	var req struct {
		ResponseData string `json:"response_data"` // Stringified JSON
		SignatureURL string `json:"signature_url"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	parsedGatongUUID, err := uuid.Parse(gatongID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid gatong id"})
	}

	response := models.GatongResponse{
		GatongID:     parsedGatongUUID,
		UserID:       userID,
		ResponseData: req.ResponseData,
		SignatureURL: req.SignatureURL,
	}

	if err := p.db.Create(&response).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to submit response"})
	}

	return c.Status(fiber.StatusCreated).JSON(response)
}
