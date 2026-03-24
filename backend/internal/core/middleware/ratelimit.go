package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
)

// NewRateLimiter creates a Fiber rate limiter middleware.
// max: maximum requests within the window.
// window: time window duration.
func NewRateLimiter(max int, window time.Duration) fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        max,
		Expiration: window,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error":   "RATE_LIMITED",
				"message": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
			})
		},
	})
}

// AuthRateLimiter returns a limiter for auth endpoints (5 req/min by default).
func AuthRateLimiter(max int) fiber.Handler {
	if max <= 0 {
		max = 5
	}
	return NewRateLimiter(max, 1*time.Minute)
}

// APIRateLimiter returns a limiter for general API endpoints (60 req/min by default).
func APIRateLimiter(max int) fiber.Handler {
	if max <= 0 {
		max = 60
	}
	return NewRateLimiter(max, 1*time.Minute)
}

// UploadRateLimiter returns a limiter for file upload endpoints (10 req/min by default).
func UploadRateLimiter(max int) fiber.Handler {
	if max <= 0 {
		max = 10
	}
	return NewRateLimiter(max, 1*time.Minute)
}
