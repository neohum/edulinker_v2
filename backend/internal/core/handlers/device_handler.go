package handlers

import (
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DeviceHandler handles device registration and management.
type DeviceHandler struct {
	db *gorm.DB
}

func NewDeviceHandler(db *gorm.DB) *DeviceHandler {
	return &DeviceHandler{db: db}
}

// RegisterDevice registers a new device for a school.
// POST /api/core/devices/register (requires auth, role=teacher/admin)
func (h *DeviceHandler) RegisterDevice(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req struct {
		DeviceID string `json:"device_id"`
		Name     string `json:"name"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.DeviceID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "device_id is required"})
	}

	// Check if already registered
	var existing models.RegisteredDevice
	if err := h.db.Where("device_id = ?", req.DeviceID).First(&existing).Error; err == nil {
		// Update existing record
		existing.SchoolID = schoolID
		existing.Name = req.Name
		existing.IsActive = true
		h.db.Save(&existing)
		return c.JSON(fiber.Map{"message": "기기 정보가 업데이트되었습니다.", "device": existing})
	}

	device := models.RegisteredDevice{
		DeviceID: req.DeviceID,
		SchoolID: schoolID,
		Name:     req.Name,
		IsActive: true,
	}

	if err := h.db.Create(&device).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "기기 등록에 실패했습니다."})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "기기가 성공적으로 등록되었습니다.", "device": device})
}

// ListDevices lists all registered devices for the school.
// GET /api/core/devices (requires auth, role=teacher/admin)
func (h *DeviceHandler) ListDevices(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var devices []models.RegisteredDevice
	h.db.Where("school_id = ?", schoolID).Find(&devices)

	return c.JSON(devices)
}

// DeactivateDevice deactivates a registered device.
// DELETE /api/core/devices/:id (requires auth, role=teacher/admin)
func (h *DeviceHandler) DeactivateDevice(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := h.db.Model(&models.RegisteredDevice{}).Where("id = ?", id).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate device"})
	}
	return c.JSON(fiber.Map{"message": "device deactivated"})
}
