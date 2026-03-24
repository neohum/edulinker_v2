package monitoring

import (
	"context"
	"fmt"
	"runtime"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// HealthStatus represents the overall system health.
type HealthStatus string

const (
	StatusHealthy   HealthStatus = "healthy"
	StatusDegraded  HealthStatus = "degraded"
	StatusUnhealthy HealthStatus = "unhealthy"
)

// CheckResult holds the result of an individual health check.
type CheckResult struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
	Latency string `json:"latency,omitempty"`
}

// HealthResponse is the structured JSON response for the health endpoint.
type HealthResponse struct {
	Status  HealthStatus  `json:"status"`
	Checks  []CheckResult `json:"checks"`
	Uptime  string        `json:"uptime"`
	Version string        `json:"version"`
}

// HealthChecker performs health checks against system dependencies.
type HealthChecker struct {
	db        *gorm.DB
	redis     *redis.Client
	startTime time.Time
	version   string
}

// NewHealthChecker creates a new HealthChecker instance.
func NewHealthChecker(db *gorm.DB, redisClient *redis.Client, version string) *HealthChecker {
	return &HealthChecker{
		db:        db,
		redis:     redisClient,
		startTime: time.Now(),
		version:   version,
	}
}

// Handler returns a Fiber handler for the health check endpoint.
func (h *HealthChecker) Handler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		checks := make([]CheckResult, 0, 4)

		checks = append(checks, h.checkDatabase())
		checks = append(checks, h.checkRedis())
		checks = append(checks, h.checkDiskSpace())
		checks = append(checks, h.checkMemory())

		overall := StatusHealthy
		for _, check := range checks {
			if check.Status == string(StatusUnhealthy) {
				overall = StatusUnhealthy
				break
			}
			if check.Status == string(StatusDegraded) {
				overall = StatusDegraded
			}
		}

		resp := HealthResponse{
			Status:  overall,
			Checks:  checks,
			Uptime:  time.Since(h.startTime).Round(time.Second).String(),
			Version: h.version,
		}

		statusCode := fiber.StatusOK
		if overall == StatusUnhealthy {
			statusCode = fiber.StatusServiceUnavailable
		}

		return c.Status(statusCode).JSON(resp)
	}
}

func (h *HealthChecker) checkDatabase() CheckResult {
	start := time.Now()
	result := CheckResult{Name: "database"}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	sqlDB, err := h.db.WithContext(ctx).DB()
	if err != nil {
		result.Status = string(StatusUnhealthy)
		result.Message = fmt.Sprintf("failed to get underlying DB: %v", err)
		result.Latency = time.Since(start).String()
		return result
	}

	if err := sqlDB.PingContext(ctx); err != nil {
		result.Status = string(StatusUnhealthy)
		result.Message = fmt.Sprintf("ping failed: %v", err)
		result.Latency = time.Since(start).String()
		return result
	}

	var one int
	if err := sqlDB.QueryRowContext(ctx, "SELECT 1").Scan(&one); err != nil {
		result.Status = string(StatusUnhealthy)
		result.Message = fmt.Sprintf("SELECT 1 failed: %v", err)
		result.Latency = time.Since(start).String()
		return result
	}

	result.Status = string(StatusHealthy)
	result.Message = "connected"
	result.Latency = time.Since(start).String()
	return result
}

func (h *HealthChecker) checkRedis() CheckResult {
	start := time.Now()
	result := CheckResult{Name: "redis"}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := h.redis.Ping(ctx).Err(); err != nil {
		result.Status = string(StatusUnhealthy)
		result.Message = fmt.Sprintf("ping failed: %v", err)
		result.Latency = time.Since(start).String()
		return result
	}

	result.Status = string(StatusHealthy)
	result.Message = "connected"
	result.Latency = time.Since(start).String()
	return result
}

func (h *HealthChecker) checkDiskSpace() CheckResult {
	result := CheckResult{Name: "disk_space"}

	free, total, err := diskUsage()
	if err != nil {
		result.Status = string(StatusDegraded)
		result.Message = fmt.Sprintf("unable to check disk: %v", err)
		return result
	}

	usedPct := float64(total-free) / float64(total) * 100

	switch {
	case usedPct > 95:
		result.Status = string(StatusUnhealthy)
		result.Message = fmt.Sprintf("disk usage critical: %.1f%%", usedPct)
	case usedPct > 85:
		result.Status = string(StatusDegraded)
		result.Message = fmt.Sprintf("disk usage high: %.1f%%", usedPct)
	default:
		result.Status = string(StatusHealthy)
		result.Message = fmt.Sprintf("disk usage: %.1f%%, free: %s", usedPct, formatBytes(free))
	}

	return result
}

func (h *HealthChecker) checkMemory() CheckResult {
	result := CheckResult{Name: "memory"}

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	allocMB := float64(m.Alloc) / 1024 / 1024
	sysMB := float64(m.Sys) / 1024 / 1024
	numGC := m.NumGC

	result.Status = string(StatusHealthy)
	result.Message = fmt.Sprintf("alloc: %.1f MB, sys: %.1f MB, gc_cycles: %d", allocMB, sysMB, numGC)

	if sysMB > 1024 {
		result.Status = string(StatusDegraded)
		result.Message = fmt.Sprintf("high memory: alloc: %.1f MB, sys: %.1f MB, gc_cycles: %d", allocMB, sysMB, numGC)
	}

	return result
}

func formatBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
