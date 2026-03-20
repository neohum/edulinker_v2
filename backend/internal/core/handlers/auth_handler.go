package handlers

import (
	"log"

	"github.com/edulinker/backend/internal/core/auth"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	db      *gorm.DB
	authSvc *auth.Service
}

func NewAuthHandler(db *gorm.DB, authSvc *auth.Service) *AuthHandler {
	return &AuthHandler{db: db, authSvc: authSvc}
}

type LoginRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

// StudentLoginRequest for student login by school/grade/class/number/name.
type StudentLoginRequest struct {
	SchoolCode string `json:"school_code"`
	Grade      int    `json:"grade"`
	ClassNum   int    `json:"class_num"`
	Number     int    `json:"number"`
	Name       string `json:"name"`
}

// RegisterRequest for self-registration (public).
type RegisterRequest struct {
	SchoolCode string      `json:"school_code"`
	SchoolName string      `json:"school_name"`
	Name       string      `json:"name"`
	Phone      string      `json:"phone"`
	Password   string      `json:"password"`
	Role       models.Role `json:"role"` // teacher, parent, student
}

type LoginResponse struct {
	Token        string      `json:"token"`
	RefreshToken string      `json:"refresh_token"`
	User         models.User `json:"user"`
}

// Login authenticates a user and returns JWT tokens.
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Phone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "전화번호를 입력해주세요"})
	}

	var user models.User
	result := h.db.Preload("School").Where("phone = ? AND phone != ''", req.Phone).First(&user)
	if result.Error != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	token, err := h.authSvc.GenerateToken(&user)
	if err != nil {
		log.Printf("failed to generate token: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	refreshToken, err := h.authSvc.GenerateRefreshToken(&user)
	if err != nil {
		log.Printf("failed to generate refresh token: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(LoginResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         user,
	})
}

// Me returns the current authenticated user.
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user not found"})
	}

	var user models.User
	result := h.db.Preload("School").First(&user, "id = ?", userID)
	if result.Error != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	return c.JSON(user)
}

// RefreshRequest expects a refresh_token field.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Refresh generates new tokens using a valid refresh token.
func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	claims, err := h.authSvc.ValidateToken(req.RefreshToken)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid refresh token"})
	}

	var user models.User
	result := h.db.First(&user, "id = ?", claims.UserID)
	if result.Error != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user not found"})
	}

	token, err := h.authSvc.GenerateToken(&user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	refreshToken, err := h.authSvc.GenerateRefreshToken(&user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	return c.JSON(LoginResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         user,
	})
}

// StudentLogin authenticates a student by school code + grade + class + number + name.
func (h *AuthHandler) StudentLogin(c *fiber.Ctx) error {
	var req StudentLoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "잘못된 요청입니다"})
	}

	if req.SchoolCode == "" || req.Name == "" || req.Grade == 0 || req.ClassNum == 0 || req.Number == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "학교코드, 학년, 반, 번호, 이름을 모두 입력해주세요"})
	}

	// Find school by code
	var school models.School
	if err := h.db.Where("code = ?", req.SchoolCode).First(&school).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "등록되지 않은 학교입니다"})
	}

	// Find student by school + grade + class + number + name
	var user models.User
	result := h.db.Preload("School").Where(
		"school_id = ? AND role = ? AND grade = ? AND class_num = ? AND number = ? AND name = ?",
		school.ID, models.RoleStudent, req.Grade, req.ClassNum, req.Number, req.Name,
	).First(&user)
	if result.Error != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "등록되지 않은 학생입니다. 선생님에게 문의하세요."})
	}

	if !user.IsActive {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "비활성화된 계정입니다"})
	}

	token, err := h.authSvc.GenerateToken(&user)
	if err != nil {
		log.Printf("failed to generate token: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "서버 오류"})
	}

	refreshToken, err := h.authSvc.GenerateRefreshToken(&user)
	if err != nil {
		log.Printf("failed to generate refresh token: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "서버 오류"})
	}

	return c.JSON(LoginResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         user,
	})
}

// Register handles self-registration (public endpoint).
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "잘못된 요청입니다"})
	}

	if req.SchoolCode == "" || req.Name == "" || req.Phone == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "학교코드, 이름, 전화번호, 비밀번호는 필수입니다"})
	}

	switch req.Role {
	case models.RoleTeacher, models.RoleParent, models.RoleStudent:
	default:
		req.Role = models.RoleTeacher
	}

	var school models.School
	if err := h.db.Where("code = ?", req.SchoolCode).First(&school).Error; err != nil {
		if req.SchoolName == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "학교 이름을 찾을 수 없어 새로 등록할 수 없습니다"})
		}
		// Auto-register the school
		school = models.School{
			Name: req.SchoolName,
			Code: req.SchoolCode,
		}
		if err := h.db.Create(&school).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "학교 자동 등록에 실패했습니다"})
		}
	}

	var existing models.User
	if h.db.Where("phone = ?", req.Phone).First(&existing).Error == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "이미 등록된 전화번호입니다"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "서버 오류"})
	}

	user := models.User{
		SchoolID:     school.ID,
		Name:         req.Name,
		Phone:        req.Phone,
		Role:         req.Role,
		PasswordHash: string(hash),
		IsActive:     true,
	}
	if err := h.db.Create(&user).Error; err != nil {
		log.Printf("failed to create user: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "회원가입에 실패했습니다"})
	}

	h.db.Preload("School").First(&user, "id = ?", user.ID)

	token, _ := h.authSvc.GenerateToken(&user)
	refreshToken, _ := h.authSvc.GenerateRefreshToken(&user)

	return c.Status(fiber.StatusCreated).JSON(LoginResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         user,
	})
}
