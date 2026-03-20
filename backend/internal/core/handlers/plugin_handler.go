package handlers

import (
	"time"

	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PluginHandler handles plugin management endpoints.
type PluginHandler struct {
	db *gorm.DB
}

func NewPluginHandler(db *gorm.DB) *PluginHandler {
	return &PluginHandler{db: db}
}

// PluginResponse includes plugin info with school-specific status.
type PluginResponse struct {
	models.Plugin
	Enabled   bool       `json:"enabled"`
	EnabledAt *time.Time `json:"enabled_at,omitempty"`
}

// ListPlugins returns all plugins with their enabled status for the current school.
func (h *PluginHandler) ListPlugins(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	var plugins []models.Plugin
	if err := h.db.Find(&plugins).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list plugins"})
	}

	// Get school plugin states
	var schoolPlugins []models.SchoolPlugin
	h.db.Where("school_id = ?", schoolID).Find(&schoolPlugins)

	enabledMap := make(map[string]models.SchoolPlugin)
	for _, sp := range schoolPlugins {
		enabledMap[sp.PluginID] = sp
	}

	response := make([]PluginResponse, 0, len(plugins))
	for _, p := range plugins {
		pr := PluginResponse{Plugin: p}
		if sp, ok := enabledMap[p.ID]; ok {
			pr.Enabled = sp.Enabled
			pr.EnabledAt = sp.EnabledAt
		}
		response = append(response, pr)
	}

	return c.JSON(response)
}

// TogglePlugin enables or disables a plugin for the current school.
func (h *PluginHandler) TogglePlugin(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	pluginID := c.Params("id")

	// Verify plugin exists
	var plugin models.Plugin
	if err := h.db.First(&plugin, "id = ?", pluginID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "plugin not found"})
	}

	var sp models.SchoolPlugin
	result := h.db.Where("school_id = ? AND plugin_id = ?", schoolID, pluginID).First(&sp)

	now := time.Now()
	if result.Error != nil {
		// First time — create and enable
		sp = models.SchoolPlugin{
			SchoolID:  schoolID,
			PluginID:  pluginID,
			Enabled:   true,
			EnabledAt: &now,
		}
		h.db.Create(&sp)
	} else {
		// Toggle
		sp.Enabled = !sp.Enabled
		if sp.Enabled {
			sp.EnabledAt = &now
		}
		h.db.Save(&sp)
	}

	return c.JSON(fiber.Map{
		"plugin_id": pluginID,
		"enabled":   sp.Enabled,
		"message":   "plugin toggled successfully",
	})
}

// GetPluginStatus returns the status of a specific plugin for the current school.
func (h *PluginHandler) GetPluginStatus(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	pluginID := c.Params("id")

	var sp models.SchoolPlugin
	result := h.db.Where("school_id = ? AND plugin_id = ?", schoolID, pluginID).First(&sp)

	enabled := false
	if result.Error == nil {
		enabled = sp.Enabled
	}

	return c.JSON(fiber.Map{
		"plugin_id": pluginID,
		"enabled":   enabled,
	})
}
