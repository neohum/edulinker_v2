package errors

import (
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestAppError_Error(t *testing.T) {
	err := &AppError{Code: "TEST", Message: "test message", HTTPStatus: 400}
	got := err.Error()
	if !strings.Contains(got, "TEST") || !strings.Contains(got, "test message") {
		t.Errorf("Error() = %q, want to contain code and message", got)
	}
}

func TestNewAuthError(t *testing.T) {
	err := NewAuthError("bad token")
	if err.Code != CodeAuthFailed {
		t.Errorf("Code = %q, want %q", err.Code, CodeAuthFailed)
	}
	if err.HTTPStatus != fiber.StatusUnauthorized {
		t.Errorf("HTTPStatus = %d, want %d", err.HTTPStatus, fiber.StatusUnauthorized)
	}
	if err.Details != "bad token" {
		t.Errorf("Details = %q, want %q", err.Details, "bad token")
	}
}

func TestNewValidationError(t *testing.T) {
	err := NewValidationError("missing field")
	if err.Code != CodeInvalidInput {
		t.Errorf("Code = %q, want %q", err.Code, CodeInvalidInput)
	}
	if err.HTTPStatus != fiber.StatusBadRequest {
		t.Errorf("HTTPStatus = %d, want %d", err.HTTPStatus, fiber.StatusBadRequest)
	}
}

func TestNewNotFoundError(t *testing.T) {
	err := NewNotFoundError("사용자")
	if err.Code != CodeNotFound {
		t.Errorf("Code = %q, want %q", err.Code, CodeNotFound)
	}
	if !strings.Contains(err.Message, "사용자") {
		t.Errorf("Message should contain resource name, got %q", err.Message)
	}
}

func TestNewForbiddenError(t *testing.T) {
	err := NewForbiddenError("admin only")
	if err.HTTPStatus != fiber.StatusForbidden {
		t.Errorf("HTTPStatus = %d, want %d", err.HTTPStatus, fiber.StatusForbidden)
	}
}

func TestNewInternalError(t *testing.T) {
	err := NewInternalError("db crashed")
	if err.HTTPStatus != fiber.StatusInternalServerError {
		t.Errorf("HTTPStatus = %d, want %d", err.HTTPStatus, fiber.StatusInternalServerError)
	}
}

func TestNewRateLimitError(t *testing.T) {
	err := NewRateLimitError()
	if err.HTTPStatus != fiber.StatusTooManyRequests {
		t.Errorf("HTTPStatus = %d, want %d", err.HTTPStatus, fiber.StatusTooManyRequests)
	}
}

func TestNewConflictError(t *testing.T) {
	err := NewConflictError("duplicate")
	if err.Code != CodeConflict {
		t.Errorf("Code = %q, want %q", err.Code, CodeConflict)
	}
}

func TestNewPluginDisabledError(t *testing.T) {
	err := NewPluginDisabledError("messenger")
	if err.Code != CodePluginDisabled {
		t.Errorf("Code = %q, want %q", err.Code, CodePluginDisabled)
	}
	if !strings.Contains(err.Message, "messenger") {
		t.Errorf("Message should contain plugin name, got %q", err.Message)
	}
}
