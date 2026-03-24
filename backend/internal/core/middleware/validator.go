package middleware

import (
	"net/mail"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

var (
	phoneRegex = regexp.MustCompile(`^01[016789]-?\d{3,4}-?\d{4}$`)
	uuidRegex  = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

// ValidateUUIDParam validates that a URL parameter is a valid UUID.
func ValidateUUIDParam(param string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		val := c.Params(param)
		if val == "" {
			return c.Next()
		}
		if _, err := uuid.Parse(val); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "INVALID_INPUT",
				"message": param + " 파라미터가 유효한 UUID 형식이 아닙니다",
			})
		}
		return c.Next()
	}
}

// BodySizeLimit restricts request body size for specific routes.
func BodySizeLimit(maxBytes int) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if len(c.Body()) > maxBytes {
			return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
				"error":   "INVALID_INPUT",
				"message": "요청 본문이 너무 큽니다",
			})
		}
		return c.Next()
	}
}

// IsValidEmail checks if a string is a valid email address.
func IsValidEmail(email string) bool {
	_, err := mail.ParseAddress(email)
	return err == nil
}

// IsValidPhone checks if a string matches Korean phone number format.
func IsValidPhone(phone string) bool {
	cleaned := strings.ReplaceAll(phone, "-", "")
	cleaned = strings.ReplaceAll(cleaned, " ", "")
	return phoneRegex.MatchString(cleaned)
}

// IsValidUUID checks if a string is a valid UUID.
func IsValidUUID(s string) bool {
	return uuidRegex.MatchString(s)
}
