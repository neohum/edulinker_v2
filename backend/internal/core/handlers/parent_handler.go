package handlers

import (
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ParentHandler handles parent-student linking APIs.
type ParentHandler struct {
	db *gorm.DB
}

func NewParentHandler(db *gorm.DB) *ParentHandler {
	return &ParentHandler{db: db}
}

// SearchStudents godoc
// GET /api/parent/students/search?school_name=&name=
// Public endpoint — no auth required.
func (h *ParentHandler) SearchStudents(c *fiber.Ctx) error {
	schoolName := c.Query("school_name", "")
	studentName := c.Query("name", "")

	if schoolName == "" || studentName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "school_name and name are required",
		})
	}

	// Find matching school(s)
	var schools []models.School
	h.db.Where("name LIKE ?", "%"+schoolName+"%").Find(&schools)
	if len(schools) == 0 {
		return c.JSON(fiber.Map{"students": []any{}})
	}

	schoolIDs := make([]uuid.UUID, len(schools))
	for i, s := range schools {
		schoolIDs[i] = s.ID
	}

	// Search students (only public fields)
	type StudentResult struct {
		ID       uuid.UUID `json:"id"`
		Name     string    `json:"name"`
		Grade    int       `json:"grade"`
		ClassNum int       `json:"class_num"`
		Number   int       `json:"number"`
		School   string    `json:"school_name"`
	}

	var results []StudentResult
	h.db.Model(&models.User{}).
		Select("users.id, users.name, users.grade, users.class_num, users.number, schools.name as school").
		Joins("LEFT JOIN schools ON schools.id = users.school_id").
		Where("users.role = ? AND users.is_active = ? AND users.school_id IN ? AND users.name LIKE ?",
			models.RoleStudent, true, schoolIDs, "%"+studentName+"%").
		Scan(&results)

	return c.JSON(fiber.Map{"students": results})
}

// LinkParent godoc
// POST /api/parent/link
// Creates (or finds) a parent account and links them to the student.
// Public endpoint — no auth required.
func (h *ParentHandler) LinkParent(c *fiber.Ctx) error {
	var req struct {
		StudentID   string `json:"student_id"`
		ParentName  string `json:"parent_name"`
		ParentPhone string `json:"parent_phone"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	if req.StudentID == "" || req.ParentName == "" || req.ParentPhone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "student_id, parent_name, parent_phone are required"})
	}

	studentUID, err := uuid.Parse(req.StudentID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student_id"})
	}

	// Validate student exists
	var student models.User
	if err := h.db.Where("id = ? AND role = ? AND is_active = ?", studentUID, models.RoleStudent, true).First(&student).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "student not found"})
	}

	// Find or create parent account (keyed by phone)
	var parent models.User
	result := h.db.Where("phone = ? AND role = ?", req.ParentPhone, models.RoleParent).First(&parent)
	if result.Error != nil {
		// Create new parent account with same school as student
		tempPw := req.ParentPhone[len(req.ParentPhone)-4:] // Last 4 digits of phone as temp password
		hash, _ := bcrypt.GenerateFromPassword([]byte(tempPw), bcrypt.DefaultCost)
		parent = models.User{
			SchoolID:     student.SchoolID,
			Name:         req.ParentName,
			Phone:        req.ParentPhone,
			Role:         models.RoleParent,
			PasswordHash: string(hash),
			IsActive:     true,
		}
		if err := h.db.Create(&parent).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create parent account"})
		}
	}

	// Check if already linked
	var existing models.ParentStudent
	checkResult := h.db.Where("parent_id = ? AND student_id = ?", parent.ID, studentUID).First(&existing)
	if checkResult.Error == nil {
		return c.JSON(fiber.Map{
			"status":     "already_linked",
			"parent_id":  parent.ID,
			"student_id": studentUID,
		})
	}

	// Create link
	link := models.ParentStudent{
		ParentID:  parent.ID,
		StudentID: studentUID,
		SchoolID:  student.SchoolID,
		Status:    "approved",
	}
	if err := h.db.Create(&link).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to link parent to student"})
	}

	// Derive temp password for display
	tempPw := req.ParentPhone[len(req.ParentPhone)-4:]

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":        "linked",
		"parent_id":     parent.ID,
		"student_id":    studentUID,
		"temp_password": tempPw,
		"message":       "학부모 계정이 생성/연동 되었습니다. 임시 비밀번호는 전화번호 뒷 4자리입니다.",
	})
}

// GetLinkedStudents godoc
// GET /api/parent/my-students  (requires auth, role=parent)
func (h *ParentHandler) GetLinkedStudents(c *fiber.Ctx) error {
	parentID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var links []models.ParentStudent
	h.db.Preload("Student").Preload("Student.School").
		Where("parent_id = ? AND status = ?", parentID, "approved").
		Find(&links)

	students := make([]any, len(links))
	for i, l := range links {
		students[i] = l.Student
	}
	return c.JSON(fiber.Map{"students": students})
}
