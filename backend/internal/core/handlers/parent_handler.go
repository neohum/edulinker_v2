package handlers

import (
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
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
// Deprecated: Use AutoLinkStudents instead for better security.
func (h *ParentHandler) SearchStudents(c *fiber.Ctx) error {
	return c.Status(fiber.StatusGone).JSON(fiber.Map{"error": "이 기능은 더 이상 지원되지 않습니다. 본인인증 후 자동 연동 기능을 이용해 주세요."})
}

// LinkParent godoc
// POST /api/parent/link
// Deprecated: Use AutoLinkStudents instead for better security.
func (h *ParentHandler) LinkParent(c *fiber.Ctx) error {
	return c.Status(fiber.StatusGone).JSON(fiber.Map{"error": "이 기능은 더 이상 지원되지 않습니다. 본인인증 후 자동 연동 기능을 이용해 주세요."})
}

// AutoLinkStudents godoc
// POST /api/parent/auto-link (requires auth, role=parent)
// Automatically links the authenticated parent to students matching their phone number.
func (h *ParentHandler) AutoLinkStudents(c *fiber.Ctx) error {
	parentID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var parent models.User
	if err := h.db.First(&parent, "id = ?", parentID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "parent account not found"})
	}

	if parent.Phone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "등록된 전화번호가 없습니다. 본인인증을 먼저 진행해 주세요."})
	}

	// Find students with matching ParentPhone in the same school (or all schools if needed)
	// (Includes both ParentPhone and ParentPhone2 regardless of gender)
	var students []models.User
	h.db.Where("role = ? AND (parent_phone = ? OR parent_phone2 = ?) AND is_active = ?", models.RoleStudent, parent.Phone, parent.Phone, true).Find(&students)

	if len(students) == 0 {
		return c.JSON(fiber.Map{
			"message": "연칭된 학생이 없습니다. 학교에 등록된 학부모 전화번호가 현재 번호와 일치하는지 확인해 주세요.",
			"count":   0,
		})
	}

	count := 0
	for _, student := range students {
		// Check if already linked
		var existing models.ParentStudent
		if h.db.Where("parent_id = ? AND student_id = ?", parent.ID, student.ID).First(&existing).Error != nil {
			// Create link
			link := models.ParentStudent{
				ParentID:  parent.ID,
				StudentID: student.ID,
				SchoolID:  student.SchoolID,
				Status:    "approved",
			}
			if err := h.db.Create(&link).Error; err == nil {
				count++
			}
		}
	}

	return c.JSON(fiber.Map{
		"message": "학생 연동이 완료되었습니다.",
		"count":   count,
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

// GetStudentParentStatus godoc
// GET /api/parent/student-links?grade=&class_num= (requires auth, role=teacher/admin)
// Returns parent link status for each student in the teacher's class.
func (h *ParentHandler) GetStudentParentStatus(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	grade := c.QueryInt("grade", 0)
	classNum := c.QueryInt("class_num", 0)

	// Fetch students
	var students []models.User
	q := h.db.Where("school_id = ? AND role = ? AND is_active = ?", schoolID, models.RoleStudent, true)
	if grade > 0 {
		q = q.Where("grade = ?", grade)
	}
	if classNum > 0 {
		q = q.Where("class_num = ?", classNum)
	}
	q.Order("number ASC").Find(&students)

	// Collect student IDs
	studentIDs := make([]uuid.UUID, len(students))
	for i, s := range students {
		studentIDs[i] = s.ID
	}

	// Fetch parent links
	var links []models.ParentStudent
	h.db.Preload("Parent").
		Where("student_id IN ? AND status = ?", studentIDs, "approved").
		Find(&links)

	// Map studentID → array of parent info
	type ParentInfo struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	parentMap := map[uuid.UUID][]ParentInfo{}
	for _, l := range links {
		parentMap[l.StudentID] = append(parentMap[l.StudentID], ParentInfo{Name: l.Parent.Name, Phone: l.Parent.Phone})
	}

	// Build result
	type StudentParentStatus struct {
		StudentID string       `json:"student_id"`
		Name      string       `json:"name"`
		Number    int          `json:"number"`
		HasParent bool         `json:"has_parent"`
		Parents   []ParentInfo `json:"parents,omitempty"`
	}
	result := make([]StudentParentStatus, len(students))
	for i, s := range students {
		plist := parentMap[s.ID]
		result[i] = StudentParentStatus{
			StudentID: s.ID.String(),
			Name:      s.Name,
			Number:    s.Number,
			HasParent: len(plist) > 0,
			Parents:   plist,
		}
	}
	return c.JSON(result)
}
