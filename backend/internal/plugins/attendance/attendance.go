package attendance

import (
	"time"

	"github.com/edulinker/backend/internal/core/notify"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type AttendanceType string

const (
	TypeLate   AttendanceType = "late"
	TypeAbsent AttendanceType = "absent"
	TypeLeave  AttendanceType = "leave"
)

type AttendanceRecord struct {
	ID          uuid.UUID      `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID    uuid.UUID      `json:"school_id" gorm:"type:uuid;index"`
	StudentID   uuid.UUID      `json:"student_id" gorm:"type:uuid;index"`
	ReporterID  uuid.UUID      `json:"reporter_id" gorm:"type:uuid"` // parent or teacher
	TeacherID   *uuid.UUID     `json:"teacher_id,omitempty" gorm:"type:uuid"`
	Type        AttendanceType `json:"type" gorm:"type:varchar(20);not null"`
	Reason      string         `json:"reason" gorm:"type:text"`
	Date        time.Time      `json:"date" gorm:"type:date;index"`
	IsConfirmed bool           `json:"is_confirmed" gorm:"default:false"`
	ConfirmedAt *time.Time     `json:"confirmed_at,omitempty"`
	CreatedAt   time.Time      `json:"created_at" gorm:"autoCreateTime"`
}

// ── Plugin ──

type Plugin struct {
	db        *gorm.DB
	notifySvc *notify.NotificationService
}

func New(db *gorm.DB, notifySvc *notify.NotificationService) *Plugin {
	db.AutoMigrate(&AttendanceRecord{})
	return &Plugin{db: db, notifySvc: notifySvc}
}

func (p *Plugin) ID() string                         { return "attendance" }
func (p *Plugin) Name() string                       { return "지각·결석 원터치" }
func (p *Plugin) Group() string                      { return "A" }
func (p *Plugin) Version() string                    { return "1.0.0" }
func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Post("/report", p.report)
	r.Get("/", p.listRecords)
	r.Get("/today", p.todayRecords)
	r.Put("/:id/confirm", p.confirm)
}

func (p *Plugin) report(c *fiber.Ctx) error {
	reporterID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req struct {
		StudentID uuid.UUID      `json:"student_id"`
		Type      AttendanceType `json:"type"`
		Reason    string         `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	record := AttendanceRecord{
		SchoolID:   schoolID,
		StudentID:  req.StudentID,
		ReporterID: reporterID,
		Type:       req.Type,
		Reason:     req.Reason,
		Date:       time.Now(),
	}
	p.db.Create(&record)

	// Notify teacher
	if p.notifySvc != nil {
		typeLabel := map[AttendanceType]string{TypeLate: "지각", TypeAbsent: "결석", TypeLeave: "조퇴"}
		p.notifySvc.Send(notify.SendRequest{
			SchoolID: schoolID,
			PluginID: "attendance",
			Type:     notify.NotifyWarning,
			Title:    typeLabel[req.Type] + " 알림",
			Body:     "사유: " + req.Reason,
			Roles:    []string{"teacher"},
		})
	}

	return c.Status(201).JSON(record)
}

func (p *Plugin) listRecords(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 20)
	offset := (page - 1) * pageSize

	var records []AttendanceRecord
	p.db.Where("school_id = ?", schoolID).Order("date DESC, created_at DESC").
		Offset(offset).Limit(pageSize).Find(&records)

	return c.JSON(records)
}

func (p *Plugin) todayRecords(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	today := time.Now().Format("2006-01-02")

	var records []AttendanceRecord
	p.db.Where("school_id = ? AND date = ?", schoolID, today).Order("created_at DESC").Find(&records)

	return c.JSON(records)
}

func (p *Plugin) confirm(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	teacherID, _ := c.Locals("userID").(uuid.UUID)

	now := time.Now()
	p.db.Model(&AttendanceRecord{}).Where("id = ?", id).Updates(map[string]interface{}{
		"is_confirmed": true,
		"confirmed_at": &now,
		"teacher_id":   teacherID,
	})

	return c.JSON(fiber.Map{"message": "confirmed"})
}
