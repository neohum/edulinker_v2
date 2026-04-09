package resourcemgmt

import (
	"encoding/json"
	"regexp"
	"strconv"
	"time"

	"github.com/edulinker/backend/internal/core/middleware"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Plugin struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Plugin {
	return &Plugin{db: db}
}

func (p *Plugin) ID() string      { return "resourcemgmt" }
func (p *Plugin) Name() string    { return "특별실 및 자원 관리" }
func (p *Plugin) Group() string   { return "I" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	// Public (Read only) - for students/parents location info
	r.Get("/facilities", p.listFacilities)

	// Teacher/Admin (Write/Reserve)
	auth := r.Group("/", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))
	auth.Post("/facilities", p.addFacility)
	auth.Put("/facilities/:id", p.updateFacility)
	auth.Delete("/facilities/:id", p.deleteFacility)
	
	// Reservations Flow
	auth.Post("/reservations", p.reserveFacility)
	auth.Get("/reservations", p.listReservations)
	auth.Get("/reservations/pending", p.pendingReservations)
	auth.Put("/reservations/:id/reply", p.replyReservation)
}

func (p *Plugin) listFacilities(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var facilities []models.Facility
	p.db.Where("school_id = ?", schoolID).Find(&facilities)
	return c.JSON(facilities)
}

func (p *Plugin) addFacility(c *fiber.Ctx) error {
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var facility models.Facility
	if err := c.BodyParser(&facility); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	facility.SchoolID = schoolID
	p.db.Create(&facility)
	return c.Status(201).JSON(facility)
}

func (p *Plugin) updateFacility(c *fiber.Ctx) error {
	id := c.Params("id")
	var facility models.Facility
	if err := p.db.First(&facility, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	var payload models.Facility
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	facility.Name = payload.Name
	facility.Location = payload.Location
	facility.BaseTimetable = payload.BaseTimetable
	p.db.Save(&facility)
	return c.JSON(facility)
}

func (p *Plugin) deleteFacility(c *fiber.Ctx) error {
	id := c.Params("id")

	err := p.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("facility_id = ?", id).Delete(&models.FacilityReservation{}).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", id).Delete(&models.Facility{}).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to delete facility", "details": err.Error()})
	}

	return c.SendStatus(204)
}

func (p *Plugin) reserveFacility(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var res models.FacilityReservation
	if err := c.BodyParser(&res); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}
	res.TeacherID = teacherID

	// 1. 기존 확정된 예약과 겹치는지 확인
	var existing models.FacilityReservation
	if err := p.db.Where("facility_id = ? AND date = ? AND period = ? AND status = 'confirmed'", res.FacilityID, res.Date, res.Period).First(&existing).Error; err == nil {
		res.Status = "pending"
		res.TargetTeacherID = &existing.TeacherID
		p.db.Create(&res)
		return c.Status(201).JSON(res)
	}

	// 2. base_timetable 정규시간표와 겹치는지 확인
	var facility models.Facility
	if err := p.db.First(&facility, "id = ?", res.FacilityID).Error; err == nil && facility.BaseTimetable != "" {
		dateObj, err := time.Parse("2006-01-02", res.Date)
		if err == nil {
			days := map[time.Weekday]string{
				time.Monday: "월", time.Tuesday: "화", time.Wednesday: "수", time.Thursday: "목", time.Friday: "금",
			}
			dayStr := days[dateObj.Weekday()]
			if dayStr != "" {
				var tt map[string]map[string]string
				if err := json.Unmarshal([]byte(facility.BaseTimetable), &tt); err == nil {
					periodStr := strconv.Itoa(res.Period)
					if classStr, exists := tt[dayStr][periodStr]; exists && classStr != "" {
						re1 := regexp.MustCompile(`(\d+)\s*학년\s*(\d+)\s*반`)
						re2 := regexp.MustCompile(`(\d+)\s*-\s*(\d+)`)
						var grade, classNum int
						matches := re1.FindStringSubmatch(classStr)
						if matches == nil {
							matches = re2.FindStringSubmatch(classStr)
						}
						
						if matches != nil {
							grade, _ = strconv.Atoi(matches[1])
							classNum, _ = strconv.Atoi(matches[2])
							
							var targetTeacher models.User
							if err := p.db.Where("grade = ? AND class_num = ? AND role = 'teacher'", grade, classNum).First(&targetTeacher).Error; err == nil {
								res.Status = "pending"
								res.TargetTeacherID = &targetTeacher.ID
								p.db.Create(&res)
								return c.Status(201).JSON(res)
							}
						}
						return c.Status(400).JSON(fiber.Map{"error": "정규 시간표와 겹치지만 담당 교사가 명확하지 않아 예약이 불가능합니다."})
					}
				}
			}
		}
	}

	// 3. 겹치지 않으면 확정
	res.Status = "confirmed"
	p.db.Create(&res)
	return c.Status(201).JSON(res)
}

func (p *Plugin) listReservations(c *fiber.Ctx) error {
	var reservations []models.FacilityReservation
	p.db.Preload("Facility").Order("date asc, period asc").Find(&reservations)
	return c.JSON(reservations)
}

func (p *Plugin) pendingReservations(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	var reservations []models.FacilityReservation
	p.db.Preload("Facility").Where("target_teacher_id = ? AND status = 'pending'", teacherID).Find(&reservations)
	return c.JSON(reservations)
}

func (p *Plugin) replyReservation(c *fiber.Ctx) error {
	teacherID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	id := c.Params("id")
	
	var payload struct {
		Reply string `json:"reply"` // "approve" or "reject"
	}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}

	var res models.FacilityReservation
	if err := p.db.Where("id = ? AND target_teacher_id = ?", id, teacherID).First(&res).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}

	if payload.Reply == "approve" {
		// 기존 예약이 있다면 상태 변경
		p.db.Model(&models.FacilityReservation{}).
		   Where("facility_id = ? AND date = ? AND period = ? AND status = 'confirmed' AND teacher_id = ?", 
		         res.FacilityID, res.Date, res.Period, teacherID).
		   Update("status", "yielded")

		res.Status = "confirmed"
	} else {
		res.Status = "rejected"
	}
	
	p.db.Save(&res)
	return c.JSON(res)
}
