package handlers

import (
	"log"

	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// SchoolHandler handles school management endpoints.
type SchoolHandler struct {
	db *gorm.DB
}

func NewSchoolHandler(db *gorm.DB) *SchoolHandler {
	return &SchoolHandler{db: db}
}

type CreateSchoolRequest struct {
	Name    string `json:"name"`
	Code    string `json:"code"`
	Address string `json:"address,omitempty"`
	Phone   string `json:"phone,omitempty"`
}

type SetupSchoolRequest struct {
	SchoolName    string `json:"school_name"`
	SchoolCode    string `json:"school_code"`
	AdminName     string `json:"admin_name"`
	AdminLoginID  string `json:"admin_login_id"`
	AdminEmail    string `json:"admin_email"` // Optional
	AdminPassword string `json:"admin_password"`
}

type SetupSchoolResponse struct {
	School  models.School `json:"school"`
	Admin   models.User   `json:"admin"`
	Message string        `json:"message"`
}

// SetupSchool creates a school and its first admin user (public, for initial setup only).
func (h *SchoolHandler) SetupSchool(c *fiber.Ctx) error {
	var req SetupSchoolRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.SchoolName == "" || req.SchoolCode == "" || req.AdminName == "" || req.AdminLoginID == "" || req.AdminPassword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "all fields are required"})
	}

	// Check if school code already exists
	var existing models.School
	if h.db.Where("code = ?", req.SchoolCode).First(&existing).Error == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "school code already exists"})
	}

	// Create school
	school := models.School{
		Name: req.SchoolName,
		Code: req.SchoolCode,
	}
	if err := h.db.Create(&school).Error; err != nil {
		log.Printf("failed to create school: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create school"})
	}

	// Hash admin password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	// Create admin user
	admin := models.User{
		SchoolID:     school.ID,
		Name:         req.AdminName,
		LoginID:      &req.AdminLoginID,
		Email:        req.AdminEmail,
		Role:         models.RoleAdmin,
		PasswordHash: string(hash),
		IsActive:     true,
	}
	if err := h.db.Create(&admin).Error; err != nil {
		log.Printf("failed to create admin: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create admin user"})
	}

	// Enable all Phase 1 plugins for this school
	var plugins []models.Plugin
	h.db.Find(&plugins)
	for _, p := range plugins {
		sp := models.SchoolPlugin{
			SchoolID: school.ID,
			PluginID: p.ID,
			Enabled:  true,
		}
		h.db.Create(&sp)
	}

	return c.Status(fiber.StatusCreated).JSON(SetupSchoolResponse{
		School:  school,
		Admin:   admin,
		Message: "학교가 생성되었습니다. 관리자 계정으로 로그인하세요.",
	})
}

// ListSchools returns all schools (admin only).
func (h *SchoolHandler) ListSchools(c *fiber.Ctx) error {
	var schools []models.School
	h.db.Order("name ASC").Find(&schools)
	return c.JSON(schools)
}

// GetSchool returns the current user's school info.
func (h *SchoolHandler) GetSchool(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	var school models.School
	if h.db.First(&school, "id = ?", schoolID).Error != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "school not found"})
	}

	return c.JSON(school)
}
