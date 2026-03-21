package handlers

import (
	"fmt"
	"log"
	"strconv"
	"strings"

	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// UserHandler handles user management endpoints.
type UserHandler struct {
	db *gorm.DB
}

func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{db: db}
}

// ── Request / Response types ──

type CreateUserRequest struct {
	SchoolID uuid.UUID   `json:"school_id"`
	Name     string      `json:"name"`
	Phone    string      `json:"phone"`
	Email    string      `json:"email,omitempty"`
	Role     models.Role `json:"role"`
	Password string      `json:"password"`
}

type UpdateUserRequest struct {
	Name       string  `json:"name,omitempty"`
	Phone      string  `json:"phone,omitempty"`
	ClassPhone string  `json:"class_phone,omitempty"`
	Email      string  `json:"email,omitempty"`
	IsActive   *bool   `json:"is_active,omitempty"`
	Grade      *int    `json:"grade,omitempty"`
	ClassNum   *int    `json:"class_num,omitempty"`
	Department *string `json:"department,omitempty"`
	TaskName   *string `json:"task_name,omitempty"`
}

type UserListResponse struct {
	Users    []models.User `json:"users"`
	Total    int64         `json:"total"`
	Page     int           `json:"page"`
	PageSize int           `json:"page_size"`
}

type ImportStudentResult struct {
	Total   int      `json:"total"`
	Created int      `json:"created"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors,omitempty"`
}

type AddStudentRequest struct {
	Grade    int    `json:"grade"`
	ClassNum int    `json:"class_num"`
	Number   int    `json:"number"`
	Name     string `json:"name"`
}

// ── Handlers ──

// CreateUser registers a new user (admin-only).
func (h *UserHandler) CreateUser(c *fiber.Ctx) error {
	var req CreateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// Validate required fields
	if req.Name == "" || req.Phone == "" || req.Password == "" || req.Role == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, phone, password, role are required"})
	}

	// Validate role
	switch req.Role {
	case models.RoleAdmin, models.RoleTeacher, models.RoleParent, models.RoleStudent:
		// OK
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role: must be admin, teacher, parent, or student"})
	}

	// Check phone uniqueness
	var existing models.User
	if h.db.Where("phone = ?", req.Phone).First(&existing).Error == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "phone number already registered"})
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("failed to hash password: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}

	// Use school from token context if not specified
	schoolID := req.SchoolID
	if schoolID == uuid.Nil {
		if sid, ok := c.Locals("schoolID").(uuid.UUID); ok {
			schoolID = sid
		}
	}

	user := models.User{
		SchoolID:     schoolID,
		Name:         req.Name,
		Phone:        req.Phone,
		Email:        req.Email,
		Role:         req.Role,
		PasswordHash: string(hash),
		IsActive:     true,
	}

	if err := h.db.Create(&user).Error; err != nil {
		log.Printf("failed to create user: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create user"})
	}

	// Reload with school
	h.db.Preload("School").First(&user, "id = ?", user.ID)

	return c.Status(fiber.StatusCreated).JSON(user)
}

// ListUsers returns a paginated list of users for the current school.
func (h *UserHandler) ListUsers(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 20)
	roleFilter := c.Query("role", "")
	gradeFilter := c.QueryInt("grade", 0)
	classFilter := c.QueryInt("class_num", 0)

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := h.db.Where("school_id = ?", schoolID)
	if roleFilter != "" {
		query = query.Where("role = ?", roleFilter)
	}
	if gradeFilter > 0 {
		query = query.Where("grade = ?", gradeFilter)
	}
	if classFilter > 0 {
		query = query.Where("class_num = ?", classFilter)
	}

	var total int64
	query.Model(&models.User{}).Count(&total)

	var users []models.User
	offset := (page - 1) * pageSize
	query.Preload("School").Offset(offset).Limit(pageSize).Order("grade ASC, class_num ASC, number ASC, name ASC").Find(&users)

	return c.JSON(UserListResponse{
		Users:    users,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

// GetUser returns a specific user by ID.
func (h *UserHandler) GetUser(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	var user models.User
	result := h.db.Preload("School").First(&user, "id = ?", userID)
	if result.Error != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	return c.JSON(user)
}

// UpdateUser modifies user fields (admin or self).
func (h *UserHandler) UpdateUser(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	// Check authorization: admin can update anyone, users can update themselves
	currentUserID, _ := c.Locals("userID").(uuid.UUID)
	currentRole, _ := c.Locals("role").(models.Role)
	if currentRole != models.RoleAdmin && currentUserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "insufficient permissions"})
	}

	var req UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	var user models.User
	if h.db.First(&user, "id = ?", userID).Error != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	// Apply updates
	if req.Name != "" {
		user.Name = req.Name
	}
	if req.Phone != "" {
		user.Phone = req.Phone
	}
	if req.ClassPhone != "" {
		user.ClassPhone = req.ClassPhone
	}
	if req.Email != "" {
		user.Email = req.Email
	}
	if req.IsActive != nil && currentRole == models.RoleAdmin {
		user.IsActive = *req.IsActive
	}
	if req.Grade != nil {
		user.Grade = *req.Grade
	}
	if req.ClassNum != nil {
		user.Class = *req.ClassNum
	}
	if req.Department != nil {
		user.Department = *req.Department
	}
	if req.TaskName != nil {
		user.TaskName = *req.TaskName
	}

	h.db.Save(&user)
	h.db.Preload("School").First(&user, "id = ?", user.ID)

	return c.JSON(user)
}

// DeleteUser removes a user (admin-only).
func (h *UserHandler) DeleteUser(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	result := h.db.Delete(&models.User{}, "id = ?", userID)
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	return c.JSON(fiber.Map{"message": "user deleted"})
}

// AddStudent registers a single student (teacher or admin).
func (h *UserHandler) AddStudent(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	var req AddStudentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "잘못된 요청입니다"})
	}

	if req.Name == "" || req.Grade < 1 || req.ClassNum < 1 || req.Number < 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "학년, 반, 번호, 이름을 모두 입력해주세요"})
	}

	// Check duplicate
	var existing models.User
	if h.db.Where("school_id = ? AND role = ? AND grade = ? AND class_num = ? AND number = ?",
		schoolID, models.RoleStudent, req.Grade, req.ClassNum, req.Number).First(&existing).Error == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": fmt.Sprintf("%d학년 %d반 %d번은 이미 등록되어 있습니다 (%s)", req.Grade, req.ClassNum, req.Number, existing.Name),
		})
	}

	student := models.User{
		SchoolID: schoolID,
		Name:     req.Name,
		Role:     models.RoleStudent,
		Grade:    req.Grade,
		Class:    req.ClassNum,
		Number:   req.Number,
		IsActive: true,
	}

	if err := h.db.Create(&student).Error; err != nil {
		log.Printf("failed to create student: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "학생 등록에 실패했습니다"})
	}

	h.db.Preload("School").First(&student, "id = ?", student.ID)

	return c.Status(fiber.StatusCreated).JSON(student)
}

// ImportStudentsExcel handles bulk student registration via Excel file upload.
// Expected Excel format: Row 1 = header, then columns: 학년, 반, 번호, 이름
func (h *UserHandler) ImportStudentsExcel(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "엑셀 파일을 업로드해주세요"})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "파일을 열 수 없습니다"})
	}
	defer src.Close()

	f, err := excelize.OpenReader(src)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "엑셀 파일을 읽을 수 없습니다. .xlsx 형식인지 확인해주세요."})
	}
	defer f.Close()

	// Read the first sheet
	sheetName := f.GetSheetName(0)
	rows, err := f.GetRows(sheetName)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "시트를 읽을 수 없습니다"})
	}

	if len(rows) < 2 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "데이터가 없습니다. 헤더 행 아래에 학생 데이터를 입력해주세요."})
	}

	// Detect column indices from header row
	header := rows[0]
	gradeCol, classCol, numCol, nameCol := -1, -1, -1, -1
	for i, cell := range header {
		cell = strings.TrimSpace(cell)
		switch {
		case strings.Contains(cell, "학년"):
			gradeCol = i
		case strings.Contains(cell, "반"):
			classCol = i
		case strings.Contains(cell, "번호") || strings.Contains(cell, "번"):
			numCol = i
		case strings.Contains(cell, "이름") || strings.Contains(cell, "성명"):
			nameCol = i
		}
	}

	if gradeCol == -1 || classCol == -1 || numCol == -1 || nameCol == -1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "엑셀 헤더에 '학년', '반', '번호', '이름' 열이 필요합니다.",
		})
	}

	result := ImportStudentResult{Total: len(rows) - 1}

	for i, row := range rows[1:] {
		rowNum := i + 2 // 1-indexed, skip header

		if len(row) <= nameCol || len(row) <= gradeCol || len(row) <= classCol || len(row) <= numCol {
			result.Errors = append(result.Errors, fmt.Sprintf("%d행: 데이터가 부족합니다", rowNum))
			continue
		}

		name := strings.TrimSpace(row[nameCol])
		gradeStr := strings.TrimSpace(row[gradeCol])
		classStr := strings.TrimSpace(row[classCol])
		numStr := strings.TrimSpace(row[numCol])

		if name == "" {
			result.Errors = append(result.Errors, fmt.Sprintf("%d행: 이름이 비어있습니다", rowNum))
			continue
		}

		grade, err := strconv.Atoi(gradeStr)
		if err != nil || grade < 1 {
			result.Errors = append(result.Errors, fmt.Sprintf("%d행: 학년 '%s'이(가) 올바르지 않습니다", rowNum, gradeStr))
			continue
		}

		classNum, err := strconv.Atoi(classStr)
		if err != nil || classNum < 1 {
			result.Errors = append(result.Errors, fmt.Sprintf("%d행: 반 '%s'이(가) 올바르지 않습니다", rowNum, classStr))
			continue
		}

		number, err := strconv.Atoi(numStr)
		if err != nil || number < 1 {
			result.Errors = append(result.Errors, fmt.Sprintf("%d행: 번호 '%s'이(가) 올바르지 않습니다", rowNum, numStr))
			continue
		}

		// Check if student already exists (same school + grade + class + number)
		var existing models.User
		if h.db.Where("school_id = ? AND role = ? AND grade = ? AND class_num = ? AND number = ?",
			schoolID, models.RoleStudent, grade, classNum, number).First(&existing).Error == nil {
			// Update name if changed
			if existing.Name != name {
				existing.Name = name
				h.db.Save(&existing)
			}
			result.Skipped++
			continue
		}

		// Create student (no password needed - students login by school/grade/class/number/name)
		student := models.User{
			SchoolID: schoolID,
			Name:     name,
			Role:     models.RoleStudent,
			Grade:    grade,
			Class:    classNum,
			Number:   number,
			IsActive: true,
		}

		if err := h.db.Create(&student).Error; err != nil {
			log.Printf("failed to create student row %d: %v", rowNum, err)
			result.Errors = append(result.Errors, fmt.Sprintf("%d행: 저장 실패 - %s", rowNum, name))
			continue
		}

		result.Created++
	}

	return c.JSON(result)
}

// DeleteStudentsBatch deletes multiple students by their IDs.
func (h *UserHandler) DeleteStudentsBatch(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	var req struct {
		IDs []uuid.UUID `json:"ids"`
	}
	if err := c.BodyParser(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "삭제할 학생 ID를 지정해주세요"})
	}

	result := h.db.Where("school_id = ? AND role = ? AND id IN ?",
		schoolID, models.RoleStudent, req.IDs).Delete(&models.User{})

	return c.JSON(fiber.Map{
		"message": fmt.Sprintf("학생 %d명이 삭제되었습니다", result.RowsAffected),
		"deleted": result.RowsAffected,
	})
}

// DeleteStudentsByClass deletes all students in a specific grade/class.
func (h *UserHandler) DeleteStudentsByClass(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	grade := c.QueryInt("grade", 0)
	classNum := c.QueryInt("class_num", 0)

	if grade == 0 || classNum == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "학년과 반을 지정해주세요"})
	}

	result := h.db.Where("school_id = ? AND role = ? AND grade = ? AND class_num = ?",
		schoolID, models.RoleStudent, grade, classNum).Delete(&models.User{})

	return c.JSON(fiber.Map{
		"message": fmt.Sprintf("%d학년 %d반 학생 %d명이 삭제되었습니다", grade, classNum, result.RowsAffected),
		"deleted": result.RowsAffected,
	})
}
