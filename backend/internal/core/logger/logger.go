package logger

import (
	"io"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// Log is the package-level logger instance.
var Log zerolog.Logger

// Init initializes the global structured logger.
// level: debug, info, warn, error (from LOG_LEVEL env var).
// pretty: true for human-readable console output (development).
func Init(level string, pretty bool) {
	var writer io.Writer = os.Stdout

	if pretty {
		writer = zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: time.RFC3339,
		}
	}

	lvl := parseLevel(level)

	Log = zerolog.New(writer).
		Level(lvl).
		With().
		Timestamp().
		Caller().
		Logger()
}

func parseLevel(level string) zerolog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return zerolog.DebugLevel
	case "warn", "warning":
		return zerolog.WarnLevel
	case "error":
		return zerolog.ErrorLevel
	default:
		return zerolog.InfoLevel
	}
}

// RequestIDMiddleware injects a unique request ID into each request context.
func RequestIDMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		requestID := c.Get("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}
		c.Set("X-Request-ID", requestID)
		c.Locals("requestID", requestID)
		return c.Next()
	}
}

// RequestLoggerMiddleware logs every HTTP request with structured fields.
func RequestLoggerMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		// Skip health check logging
		if c.Path() == "/health" {
			return c.Next()
		}

		err := c.Next()

		latency := time.Since(start)
		status := c.Response().StatusCode()

		event := Log.Info()
		if status >= 500 {
			event = Log.Error()
		} else if status >= 400 {
			event = Log.Warn()
		}

		// Add request ID
		if rid, ok := c.Locals("requestID").(string); ok {
			event = event.Str("request_id", rid)
		}

		// Add user context if available
		if userID, ok := c.Locals("userID").(uuid.UUID); ok {
			event = event.Str("user_id", userID.String())
		}
		if schoolID, ok := c.Locals("schoolID").(uuid.UUID); ok {
			event = event.Str("school_id", schoolID.String())
		}

		event.
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", status).
			Dur("latency", latency).
			Str("ip", c.IP()).
			Msg("request")

		return err
	}
}
