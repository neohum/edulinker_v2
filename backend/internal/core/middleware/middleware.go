package middleware

import (
	"strings"

	"github.com/edulinker/backend/internal/core/auth"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AuthMiddleware validates JWT tokens and adds user info to context.
func AuthMiddleware(authSvc *auth.Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		header := c.Get("Authorization")
		if header == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
			})
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid authorization format",
			})
		}

		claims, err := authSvc.ValidateToken(parts[1])
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired token",
			})
		}

		// Store claims in context for downstream handlers
		c.Locals("userID", claims.UserID)
		c.Locals("schoolID", claims.SchoolID)
		c.Locals("role", claims.Role)

		return c.Next()
	}
}

// RoleMiddleware restricts access to specific roles.
func RoleMiddleware(allowedRoles ...models.Role) fiber.Handler {
	return func(c *fiber.Ctx) error {
		role, ok := c.Locals("role").(models.Role)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "role not found in context",
			})
		}

		for _, allowed := range allowedRoles {
			if role == allowed {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "insufficient permissions",
		})
	}
}

// PluginMiddleware checks if the requested plugin is enabled for the school.
func PluginMiddleware(db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		schoolID, ok := c.Locals("schoolID").(uuid.UUID)
		if !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "school context not found",
			})
		}

		// Extract plugin ID from the URL path: /api/plugins/{pluginID}/...
		pluginID := c.Params("pluginID")
		if pluginID == "" {
			return c.Next() // Not a plugin route
		}

		var sp models.SchoolPlugin
		result := db.Where("school_id = ? AND plugin_id = ? AND enabled = true", schoolID, pluginID).First(&sp)
		if result.Error != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "plugin is not enabled for this school",
			})
		}

		return c.Next()
	}
}
