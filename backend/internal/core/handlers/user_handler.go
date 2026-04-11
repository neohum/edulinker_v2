package handlers

import (
	"fmt"
	"strconv"
	"strings"

	applogger "github.com/edulinker/backend/internal/core/logger"
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
	Position string      `json:"position,omitempty"`
	Password string      `json:"password"`
}

type UpdateUserRequest struct {
	Name         string  `json:"name,omitempty"`
	Phone        string  `json:"phone,omitempty"`
	ClassPhone   string  `json:"class_phone,omitempty"`
	Email        string  `json:"email,omitempty"`
	IsActive     *bool   `json:"is_active,omitempty"`
	Grade        *int    `json:"grade,omitempty"`
	ClassNum     *int    `json:"class_num,omitempty"`
	Department   *string `json:"department,omitempty"`
	TaskName     *string `json:"task_name,omitempty"`
	Position     *string `json:"position,omitempty"`
	Gender       *string `json:"gender,omitempty"`
	Number       *int    `json:"number,omitempty"`
	PIN          *string `json:"pin,omitempty"`
	ParentPhone  *string `json:"parent_phone,omitempty"`
	ParentPhone2 *string `json:"parent_phone2,omitempty"`
	ProfileImage *string `json:"profile_image,omitempty"`
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
	Grade        int    `json:"grade"`
	ClassNum     int    `json:"class_num"`
	Number       int    `json:"number"`
	Name         string `json:"name"`
	Gender       string `json:"gender,omitempty"`
	PIN          string `json:"pin,omitempty"`
	ParentPhone  string `json:"parent_phone,omitempty"`
	ParentPhone2 string `json:"parent_phone2,omitempty"`
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
		applogger.Log.Error().Err(err).Msg("failed to hash password")
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
		Position:     req.Position,
		PasswordHash: string(hash),
		IsActive:     true,
	}

	if err := h.db.Create(&user).Error; err != nil {
		applogger.Log.Error().Err(err).Msg("failed to create user")
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
	nameFilter := c.Query("name", "")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 1000 {
		pageSize = 1000
	}

	query := h.db.Where("school_id = ? AND is_active = ?", schoolID, true)
	if roleFilter != "" {
		roles := strings.Split(roleFilter, ",")
		if len(roles) == 1 {
			query = query.Where("role = ?", roles[0])
		} else {
			query = query.Where("role IN ?", roles)
		}
	}
	if gradeFilter > 0 {
		query = query.Where("grade = ?", gradeFilter)
	}
	if classFilter > 0 {
		query = query.Where("class_num = ?", classFilter)
	}
	if nameFilter != "" {
		query = query.Where("name LIKE ?", "%"+nameFilter+"%")
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

	var user models.User
	if h.db.First(&user, "id = ?", userID).Error != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	// Check authorization: admin can update anyone, users can update themselves
	currentUserID, _ := c.Locals("userID").(uuid.UUID)
	currentRole, _ := c.Locals("role").(models.Role)
	currentSchoolID, _ := c.Locals("schoolID").(uuid.UUID)

	if currentRole != models.RoleAdmin && currentUserID != userID {
		// Allow teachers to update students in the same school
		if currentRole == models.RoleTeacher && user.Role == models.RoleStudent && user.SchoolID == currentSchoolID {
			// Authorized
		} else {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "insufficient permissions"})
		}
	}

	var req UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
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
	if req.Position != nil {
		user.Position = *req.Position
	}
	if req.Gender != nil {
		user.Gender = *req.Gender
	}
	if req.Number != nil {
		user.Number = *req.Number
	}
	if req.PIN != nil {
		pinHash, err := bcrypt.GenerateFromPassword([]byte(*req.PIN), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
		}
		user.PIN = string(pinHash)
	}
	if req.ParentPhone != nil {
		user.ParentPhone = *req.ParentPhone
	}
	if req.ParentPhone2 != nil {
		user.ParentPhone2 = *req.ParentPhone2
	}
	if req.ProfileImage != nil {
		user.ProfileImage = *req.ProfileImage
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

	result := h.db.Model(&models.User{}).Where("id = ?", userID).Update("is_active", false)
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	return c.JSON(fiber.Map{"message": "user deactivated"})
}

// ReactivateUser restores a soft-deleted user (admin-only).
func (h *UserHandler) ReactivateUser(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	result := h.db.Model(&models.User{}).Where("id = ?", userID).Update("is_active", true)
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	return c.JSON(fiber.Map{"message": "user reactivated"})
}

// HardDeleteUser permanently deletes a user after clearing FK references (admin-only).
func (h *UserHandler) HardDeleteUser(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	// 1. NULL out sendoc author references to avoid FK violation
	h.db.Exec("UPDATE sendocs SET author_id = NULL WHERE author_id = ?", userID)

	// 2. Remove parent-student links
	h.db.Exec("DELETE FROM parent_students WHERE parent_id = ? OR student_id = ?", userID, userID)

	// 3. Hard delete the user
	if err := h.db.Unscoped().Delete(&models.User{}, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete user"})
	}

	return c.JSON(fiber.Map{"message": "user permanently deleted"})
}

// ListInactiveUsers returns deactivated users for the school (admin-only).
func (h *UserHandler) ListInactiveUsers(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "school context not found"})
	}

	var users []models.User
	h.db.Preload("School").Where("school_id = ? AND is_active = ?", schoolID, false).
		Order("role, name").Find(&users)

	return c.JSON(fiber.Map{"users": users, "total": len(users)})
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

		// If the existing student is deactivated, we can safely reactivate and update them instead of returning Conflict
		if !existing.IsActive {
			existing.IsActive = true
			existing.Name = req.Name
			existing.Gender = req.Gender
			if req.ParentPhone != "" {
				existing.ParentPhone = req.ParentPhone
			}
			if req.ParentPhone2 != "" {
				existing.ParentPhone2 = req.ParentPhone2
			}
			if req.PIN != "" {
				if pinHash, err := bcrypt.GenerateFromPassword([]byte(req.PIN), bcrypt.DefaultCost); err == nil {
					existing.PIN = string(pinHash)
				}
			}
			h.db.Save(&existing)
			return c.Status(fiber.StatusCreated).JSON(existing)
		}

		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": fmt.Sprintf("%d학년 %d반 %d번은 이미 등록되어 있습니다 (%s)", req.Grade, req.ClassNum, req.Number, existing.Name),
		})
	}

	student := models.User{
		SchoolID:     schoolID,
		Name:         req.Name,
		Role:         models.RoleStudent,
		Grade:        req.Grade,
		Class:        req.ClassNum,
		Number:       req.Number,
		Gender:       req.Gender,
		ParentPhone:  req.ParentPhone,
		ParentPhone2: req.ParentPhone2,
		IsActive:     true,
	}

	pinHash, err := bcrypt.GenerateFromPassword([]byte("1234"), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
	}
	student.PIN = string(pinHash)

	if err := h.db.Create(&student).Error; err != nil {
		applogger.Log.Error().Err(err).Msg("failed to create student")
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
	gradeCol, classCol, numCol, nameCol, genderCol, parentPhoneCol, parentPhone2Col := -1, -1, -1, -1, -1, -1, -1
	for i, cell := range header {
		cell = strings.ReplaceAll(strings.TrimSpace(cell), " ", "") // remove all spaces for easier matching
		if strings.Contains(cell, "학년") {
			gradeCol = i
		} else if strings.Contains(cell, "반") {
			classCol = i
		} else if strings.Contains(cell, "이름") || strings.Contains(cell, "성명") {
			nameCol = i
		} else if strings.Contains(cell, "성별") {
			genderCol = i
		} else if strings.Contains(cell, "학부모전화번호2") || strings.Contains(cell, "연락처2") || strings.Contains(cell, "학부모연락처2") || strings.Contains(cell, "전화번호2") {
			parentPhone2Col = i
		} else if strings.Contains(cell, "학부모전화번호1") || strings.Contains(cell, "학부모전화번호") || strings.Contains(cell, "전화번호1") || strings.Contains(cell, "전화번호") || strings.Contains(cell, "학부모연락처") || strings.Contains(cell, "연락처1") || strings.Contains(cell, "연락처") {
			parentPhoneCol = i
		} else if strings.Contains(cell, "번호") || strings.Contains(cell, "번") {
			numCol = i
		}
	}

	if gradeCol == -1 || classCol == -1 || numCol == -1 || nameCol == -1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "엑셀 헤더에 '학년', '반', '번호', '이름' 열이 필요합니다.",
		})
	}

	applogger.Log.Info().
		Int("grade", gradeCol).Int("class", classCol).Int("name", nameCol).
		Int("num", numCol).Int("gender", genderCol).
		Int("parent1", parentPhoneCol).Int("parent2", parentPhone2Col).
		Msg("Excel Columns Detected")

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

		gender := ""
		gRaw := ""
		if genderCol >= 0 && genderCol < len(row) {
			g := strings.TrimSpace(row[genderCol])
			gRaw = g

			if g == "남" || g == "남자" || g == "남성" || g == "M" || g == "m" {
				gender = "남"
			} else if g == "여" || g == "여자" || g == "여성" || g == "F" || g == "f" {
				gender = "여"
			}
		}

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

		parentPhone := ""
		if parentPhoneCol >= 0 && parentPhoneCol < len(row) {
			parentPhone = strings.TrimSpace(row[parentPhoneCol])
		}

		parentPhone2 := ""
		if parentPhone2Col >= 0 && parentPhone2Col < len(row) {
			parentPhone2 = strings.TrimSpace(row[parentPhone2Col])
		}

		pin := "1234"

		applogger.Log.Info().
			Int("row", rowNum).
			Str("name", name).
			Str("gRaw", gRaw).
			Str("gender", gender).
			Msg("Processing row")

		// Check if student already exists (same school + grade + class + number)
		var existing models.User
		if h.db.Where("school_id = ? AND role = ? AND grade = ? AND class_num = ? AND number = ?",
			schoolID, models.RoleStudent, grade, classNum, number).First(&existing).Error == nil {
			updated := false
			reactivated := false

			if !existing.IsActive {
				existing.IsActive = true
				updated = true
				reactivated = true
			}

			if existing.Name != name {
				existing.Name = name
				updated = true
			}
			if gender != "" && existing.Gender != gender {
				existing.Gender = gender
				updated = true
			}
			if parentPhone != "" && existing.ParentPhone != parentPhone {
				existing.ParentPhone = parentPhone
				updated = true
			}
			if parentPhone2 != "" && existing.ParentPhone2 != parentPhone2 {
				existing.ParentPhone2 = parentPhone2
				updated = true
			}
			if pin != "" && bcrypt.CompareHashAndPassword([]byte(existing.PIN), []byte(pin)) != nil {
				if pinHash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost); err == nil {
					existing.PIN = string(pinHash)
					updated = true
				}
			}

			if updated {
				h.db.Save(&existing)
			}

			if reactivated {
				result.Created++
			} else {
				result.Skipped++
			}
			continue
		}

		// Create student
		student := models.User{
			SchoolID:     schoolID,
			Name:         name,
			Role:         models.RoleStudent,
			Grade:        grade,
			Class:        classNum,
			Number:       number,
			Gender:       gender,
			ParentPhone:  parentPhone,
			ParentPhone2: parentPhone2,
			IsActive:     true,
		}
		if pinHash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost); err == nil {
			student.PIN = string(pinHash)
		}

		if err := h.db.Create(&student).Error; err != nil {
			applogger.Log.Error().Err(err).Int("row", rowNum).Msg("failed to create student row")
			result.Errors = append(result.Errors, fmt.Sprintf("%d행: 저장 실패 - %s", rowNum, name))
			continue
		}

		result.Created++
	}

	return c.JSON(result)
}

// ResetPIN resets a student's PIN to '1234' (Teacher/Admin only)
func (h *UserHandler) ResetPIN(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	// Fetch user to verify its school and role
	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	if user.SchoolID != schoolID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "permission denied"})
	}

	if user.Role != models.RoleStudent {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "can only reset PIN for students"})
	}

	pinHash, err := bcrypt.GenerateFromPassword([]byte("1234"), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	user.PIN = string(pinHash)
	h.db.Save(&user)

	return c.JSON(fiber.Map{"message": "PIN reset to 1234 successfully"})
}

type ChangePINRequest struct {
	OldPIN string `json:"old_pin"`
	NewPIN string `json:"new_pin"`
}

// ChangePIN allows a student (or admin) to change a PIN
func (h *UserHandler) ChangePIN(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	var req ChangePINRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if len(req.NewPIN) < 4 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "새 비밀번호는 4자리 이상이어야 합니다"})
	}

	currentUserID, _ := c.Locals("userID").(uuid.UUID)
	currentRole, _ := c.Locals("role").(models.Role)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	if user.SchoolID != schoolID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "permission denied"})
	}

	// Students can only change their own PIN.
	if currentRole == models.RoleStudent && currentUserID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "permission denied"})
	}

	if currentRole == models.RoleStudent {
		if req.OldPIN != "" {
			if err := bcrypt.CompareHashAndPassword([]byte(user.PIN), []byte(req.OldPIN)); err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "기존 비밀번호가 틀렸습니다"})
			}
		} else {
			// Allow bypassing OldPIN if the current PIN is exactly "1234"
			if err := bcrypt.CompareHashAndPassword([]byte(user.PIN), []byte("1234")); err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "기존 비밀번호가 틀렸습니다"})
			}
		}
	}

	pinHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPIN), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	user.PIN = string(pinHash)
	h.db.Save(&user)

	return c.JSON(fiber.Map{"message": "PIN changed successfully"})
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// ChangePassword allows a teacher or admin to change their password
func (h *UserHandler) ChangePassword(c *fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user ID"})
	}

	var req ChangePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if len(req.NewPassword) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "새 비밀번호는 8자 이상이어야 합니다"})
	}

	currentUserID, _ := c.Locals("userID").(uuid.UUID)
	currentRole, _ := c.Locals("role").(models.Role)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	if user.SchoolID != schoolID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "permission denied"})
	}

	if currentUserID != userID && currentRole != models.RoleAdmin {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "permission denied"})
	}

	if currentUserID == userID && req.OldPassword != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "기존 비밀번호가 틀렸습니다"})
		}
	} else if currentUserID == userID && req.OldPassword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "기존 비밀번호를 입력해주세요"})
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	user.PasswordHash = string(passwordHash)
	h.db.Save(&user)

	return c.JSON(fiber.Map{"message": "비밀번호가 성공적으로 변경되었습니다"})
}

// DownloadStudentTemplate generates and returns a sample student import Excel template.
func (h *UserHandler) DownloadStudentTemplate(c *fiber.Ctx) error {
	f := excelize.NewFile()
	sheet := "학생등록양식"
	f.SetSheetName("Sheet1", sheet)

	// Header row with style
	headers := []string{"학년", "반", "번호", "성명", "성별", "학부모 전화번호1", "학부모 전화번호2"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	// Sample rows
	samples := [][]interface{}{
		{3, 2, 1, "홍길동", "남", "010-1234-5678", "010-0000-0000"},
		{3, 2, 2, "김영희", "여", "010-9876-5432", ""},
	}
	for r, row := range samples {
		for col, val := range row {
			cell, _ := excelize.CoordinatesToCellName(col+1, r+2)
			f.SetCellValue(sheet, cell, val)
		}
	}

	// Column widths
	f.SetColWidth(sheet, "A", "C", 8)
	f.SetColWidth(sheet, "D", "E", 10)
	f.SetColWidth(sheet, "F", "G", 18)

	// Add note row
	f.SetCellValue(sheet, "A5", "※ 성별 입력: 남 또는 여")

	// Write to buffer
	buf, err := f.WriteToBuffer()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "템플릿 생성 실패"})
	}

	c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set("Content-Disposition", `attachment; filename="student_template.xlsx"`)
	return c.Send(buf.Bytes())
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

	// Execute cascade deletion of teacher-related student records
	tx := h.db.Begin()

	queries := []struct {
		desc string
		sql  string
	}{
		{"sendoc 참조 해제", "UPDATE sendocs SET author_id = NULL WHERE author_id IN ?"},
		{"schoolevent 참조 해제", "UPDATE school_events SET author_id = NULL WHERE author_id IN ?"},
		{"gatong 참조 해제", "UPDATE gatongs SET author_id = NULL WHERE author_id IN ?"},
		{"학부모-학생 연결", "DELETE FROM parent_students WHERE parent_id IN ? OR student_id IN ?"},
		{"sendoc 수신자", "DELETE FROM sendoc_recipients WHERE user_id IN ?"},
		{"gatong 응답", "DELETE FROM gatong_responses WHERE user_id IN ?"},
		{"schoolevent 참여", "DELETE FROM school_event_participants WHERE user_id IN ?"},
		{"ai 분석 기록", "DELETE FROM ai_analysis_logs WHERE teacher_id IN ? OR target_student_id IN ?"},
		{"학생 상담 기록", "DELETE FROM student_counselings WHERE teacher_id IN ? OR student_id IN ?"},
		{"학생 결석 기록", "DELETE FROM student_absences WHERE student_id IN ?"},
		{"출결 기록", "DELETE FROM attendance_records WHERE student_id IN ?"},
		{"교사 인사 기록", "DELETE FROM teacher_hr_records WHERE teacher_id IN ?"},
		{"교육과정 계획", "DELETE FROM curriculum_plans WHERE teacher_id IN ?"},
		{"교육과정 평가", "DELETE FROM curriculum_evaluations WHERE teacher_id IN ? OR student_id IN ?"},
	}

	for _, q := range queries {
		tx.Exec("SAVEPOINT delete_all_sp")
		args := []interface{}{req.IDs}
		if strings.Contains(q.sql, "OR") {
			args = append(args, req.IDs)
		}
		if err := tx.Exec(q.sql, args...).Error; err != nil {
			if strings.Contains(err.Error(), "does not exist") || strings.Contains(err.Error(), "릴레이션") || strings.Contains(err.Error(), "42P01") {
				tx.Exec("ROLLBACK TO SAVEPOINT delete_all_sp")
			} else {
				tx.Rollback()
				return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("%s 처리 중 DB 오류: %v", q.desc, err)})
			}
		} else {
			tx.Exec("RELEASE SAVEPOINT delete_all_sp")
		}
	}

	// Finally, hard delete the students themselves
	result := tx.Where("school_id = ? AND role = ? AND id IN ?", schoolID, models.RoleStudent, req.IDs).Delete(&models.User{})

	tx.Commit()
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

	// First, lookup the matching student IDs for cascading deletes
	var studentIDs []uuid.UUID
	h.db.Model(&models.User{}).Where("school_id = ? AND role = ? AND grade = ? AND class_num = ?",
		schoolID, models.RoleStudent, grade, classNum).Pluck("id", &studentIDs)

	tx := h.db.Begin()

	if len(studentIDs) > 0 {
		queries := []struct {
			desc string
			sql  string
		}{
			{"sendoc 참조 해제", "UPDATE sendocs SET author_id = NULL WHERE author_id IN ?"},
			{"schoolevent 참조 해제", "UPDATE school_events SET author_id = NULL WHERE author_id IN ?"},
			{"gatong 참조 해제", "UPDATE gatongs SET author_id = NULL WHERE author_id IN ?"},
			{"학부모-학생 연결", "DELETE FROM parent_students WHERE parent_id IN ? OR student_id IN ?"},
			{"sendoc 수신자", "DELETE FROM sendoc_recipients WHERE user_id IN ?"},
			{"gatong 응답", "DELETE FROM gatong_responses WHERE user_id IN ?"},
			{"schoolevent 참여", "DELETE FROM school_event_participants WHERE user_id IN ?"},
			{"ai 분석 기록", "DELETE FROM ai_analysis_logs WHERE teacher_id IN ? OR target_student_id IN ?"},
			{"학생 상담 기록", "DELETE FROM student_counselings WHERE teacher_id IN ? OR student_id IN ?"},
			{"학생 결석 기록", "DELETE FROM student_absences WHERE student_id IN ?"},
			{"출결 기록", "DELETE FROM attendance_records WHERE student_id IN ?"},
			{"교사 인사 기록", "DELETE FROM teacher_hr_records WHERE teacher_id IN ?"},
			{"교육과정 계획", "DELETE FROM curriculum_plans WHERE teacher_id IN ?"},
			{"교육과정 평가", "DELETE FROM curriculum_evaluations WHERE teacher_id IN ? OR student_id IN ?"},
		}

		for _, q := range queries {
			tx.Exec("SAVEPOINT delete_all_sp")
			args := []interface{}{studentIDs}
			if strings.Contains(q.sql, "OR") {
				args = append(args, studentIDs)
			}
			if err := tx.Exec(q.sql, args...).Error; err != nil {
				if strings.Contains(err.Error(), "does not exist") || strings.Contains(err.Error(), "릴레이션") || strings.Contains(err.Error(), "42P01") {
					tx.Exec("ROLLBACK TO SAVEPOINT delete_all_sp")
				} else {
					tx.Rollback()
					return c.Status(500).JSON(fiber.Map{"error": fmt.Sprintf("%s 처리 중 DB 오류: %v", q.desc, err)})
				}
			} else {
				tx.Exec("RELEASE SAVEPOINT delete_all_sp")
			}
		}
	}

	result := tx.Where("school_id = ? AND role = ? AND grade = ? AND class_num = ?",
		schoolID, models.RoleStudent, grade, classNum).Delete(&models.User{})

	tx.Commit()

	return c.JSON(fiber.Map{
		"message": fmt.Sprintf("%d학년 %d반 학생 %d명이 삭제되었습니다", grade, classNum, result.RowsAffected),
		"deleted": result.RowsAffected,
	})
}
