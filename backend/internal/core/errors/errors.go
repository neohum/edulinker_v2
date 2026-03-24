package errors

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
)

// Error codes for consistent API error responses.
const (
	CodeAuthFailed     = "AUTH_FAILED"
	CodeInvalidInput   = "INVALID_INPUT"
	CodeNotFound       = "NOT_FOUND"
	CodeForbidden      = "FORBIDDEN"
	CodeInternal       = "INTERNAL"
	CodeRateLimited    = "RATE_LIMITED"
	CodePluginDisabled = "PLUGIN_DISABLED"
	CodeConflict       = "CONFLICT"
)

// AppError is a structured application error.
type AppError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	HTTPStatus int    `json:"-"`
	Details    string `json:"details,omitempty"`
}

func (e *AppError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// ErrorResponse sends a structured JSON error response.
func ErrorResponse(c *fiber.Ctx, err *AppError) error {
	return c.Status(err.HTTPStatus).JSON(fiber.Map{
		"error":   err.Code,
		"message": err.Message,
		"details": err.Details,
	})
}

// --- Error constructors ---

func NewAuthError(detail string) *AppError {
	return &AppError{
		Code:       CodeAuthFailed,
		Message:    "인증에 실패했습니다",
		HTTPStatus: fiber.StatusUnauthorized,
		Details:    detail,
	}
}

func NewValidationError(detail string) *AppError {
	return &AppError{
		Code:       CodeInvalidInput,
		Message:    "입력값이 올바르지 않습니다",
		HTTPStatus: fiber.StatusBadRequest,
		Details:    detail,
	}
}

func NewNotFoundError(resource string) *AppError {
	return &AppError{
		Code:       CodeNotFound,
		Message:    fmt.Sprintf("%s을(를) 찾을 수 없습니다", resource),
		HTTPStatus: fiber.StatusNotFound,
	}
}

func NewForbiddenError(detail string) *AppError {
	return &AppError{
		Code:       CodeForbidden,
		Message:    "접근 권한이 없습니다",
		HTTPStatus: fiber.StatusForbidden,
		Details:    detail,
	}
}

func NewInternalError(detail string) *AppError {
	return &AppError{
		Code:       CodeInternal,
		Message:    "서버 내부 오류가 발생했습니다",
		HTTPStatus: fiber.StatusInternalServerError,
		Details:    detail,
	}
}

func NewRateLimitError() *AppError {
	return &AppError{
		Code:       CodeRateLimited,
		Message:    "요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
		HTTPStatus: fiber.StatusTooManyRequests,
	}
}

func NewConflictError(detail string) *AppError {
	return &AppError{
		Code:       CodeConflict,
		Message:    "리소스 충돌이 발생했습니다",
		HTTPStatus: fiber.StatusConflict,
		Details:    detail,
	}
}

func NewPluginDisabledError(pluginName string) *AppError {
	return &AppError{
		Code:       CodePluginDisabled,
		Message:    fmt.Sprintf("%s 플러그인이 비활성화 상태입니다", pluginName),
		HTTPStatus: fiber.StatusForbidden,
	}
}
