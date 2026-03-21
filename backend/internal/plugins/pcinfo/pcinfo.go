package pcinfo

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type PCRecord struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID   uuid.UUID `json:"school_id" gorm:"type:uuid;index"`
	UserID     uuid.UUID `json:"user_id" gorm:"type:uuid;index"`
	Hostname   string    `json:"hostname" gorm:"type:varchar(100)"`
	IPAddress  string    `json:"ip_address" gorm:"type:varchar(50)"`
	MACAddress string    `json:"mac_address" gorm:"type:varchar(50)"`
	OS         string    `json:"os" gorm:"type:varchar(100)"`
	CPU        string    `json:"cpu" gorm:"type:varchar(200)"`
	RAM        string    `json:"ram" gorm:"type:varchar(50)"`
	Disk       string    `json:"disk" gorm:"type:varchar(100)"`
	Grade      int       `json:"grade" gorm:"column:grade;default:0"`
	ClassNum   int       `json:"class_num" gorm:"column:class_num;default:0"`
	Department string    `json:"department" gorm:"type:varchar(100)"`
	UserName   string    `json:"user_name" gorm:"type:varchar(100)"`
	Location   string    `json:"location" gorm:"type:varchar(100)"`
	Label      string    `json:"label" gorm:"type:varchar(100)"`
	Printers   string    `json:"printers" gorm:"type:text"`
	Monitors   string    `json:"monitors" gorm:"type:text"`
	LastSeen   time.Time `json:"last_seen" gorm:"autoUpdateTime"`
	CreatedAt  time.Time `json:"created_at" gorm:"autoCreateTime"`
}

// ── Plugin ──

type Plugin struct{ db *gorm.DB }

func New(db *gorm.DB) *Plugin {
	db.AutoMigrate(&PCRecord{})
	return &Plugin{db: db}
}

func (p *Plugin) ID() string                         { return "pcinfo" }
func (p *Plugin) Name() string                       { return "pc-info" }
func (p *Plugin) Group() string                      { return "I" }
func (p *Plugin) Version() string                    { return "1.0.0" }
func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Post("/report", p.report)
	r.Get("/", p.list)
	r.Get("/:id", p.getOne)
	r.Put("/:id/label", p.setLabel)
	r.Delete("/:id", p.delete)
}

func (p *Plugin) report(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var data map[string]interface{}
	if err := c.BodyParser(&data); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid payload"})
	}

	macAddr, _ := data["mac_address"].(string)
	userName, _ := data["user_name"].(string)
	label, _ := data["label"].(string)

	if macAddr == "" {
		return c.Status(400).JSON(fiber.Map{"error": "MAC address required"})
	}

	var rec PCRecord
	// 식별 기준을 MAC 주소 + 사용자 성함 + 라벨로 강화하여 덮어쓰기 방지
	// 만약 성함이나 라벨이 다르면 동일 PC라도 별개 자산으로 등록 가능
	query := p.db.Where("school_id = ? AND mac_address = ?", schoolID, macAddr)
	if userName != "" {
		query = query.Where("user_name = ?", userName)
	}
	if label != "" {
		query = query.Where("label = ?", label)
	}
	
	err := query.First(&rec).Error

	rec.SchoolID = schoolID
	rec.UserID = userID
	
	// 필드 업데이트
	if v, ok := data["hostname"].(string); ok { rec.Hostname = v }
	if v, ok := data["ip_address"].(string); ok { rec.IPAddress = v }
	if v, ok := data["mac_address"].(string); ok { rec.MACAddress = v }
	if v, ok := data["os"].(string); ok { rec.OS = v }
	if v, ok := data["cpu"].(string); ok { rec.CPU = v }
	if v, ok := data["ram"].(string); ok { rec.RAM = v }
	if v, ok := data["location"].(string); ok { rec.Location = v }
	if v, ok := data["label"].(string); ok { rec.Label = v }
	if v, ok := data["department"].(string); ok { rec.Department = v }
	if v, ok := data["user_name"].(string); ok { rec.UserName = v }
	if v, ok := data["printers"].(string); ok { rec.Printers = v }
	if v, ok := data["monitors"].(string); ok { rec.Monitors = v }
	
	if v, ok := data["grade"]; ok {
		switch val := v.(type) {
		case float64: rec.Grade = int(val)
		case int: rec.Grade = val
		}
	}
	if v, ok := data["class_num"]; ok {
		switch val := v.(type) {
		case float64: rec.ClassNum = int(val)
		case int: rec.ClassNum = val
		}
	}

	// 저장 (기존 정보가 완벽히 일치할 때만 Save, 아니면 새 ID로 Create)
	if err == nil {
		p.db.Save(&rec)
	} else {
		rec.ID = uuid.New() // 명시적으로 새 ID 부여
		p.db.Create(&rec)
	}

	return c.JSON(rec)
}

func (p *Plugin) list(c *fiber.Ctx) error {
	val := c.Locals("schoolID")
	if val == nil {
		return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
	}
	schoolID := val.(uuid.UUID)

	var records []PCRecord
	p.db.Where("school_id = ?", schoolID).Order("grade ASC, class_num ASC, user_name ASC, location ASC").Find(&records)
	return c.JSON(records)
}

func (p *Plugin) getOne(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	
	var rec PCRecord
	if p.db.Where("id = ? AND school_id = ?", id, schoolID).First(&rec).Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(rec)
}

func (p *Plugin) setLabel(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	
	var data map[string]interface{}
	c.BodyParser(&data)
	
	updates := make(map[string]interface{})
	stringFields := []string{"label", "location", "department", "user_name", "hostname", "ip_address", "os", "cpu", "ram", "printers", "monitors"}
	for _, f := range stringFields {
		if v, ok := data[f].(string); ok { updates[f] = v }
	}
	
	if v, ok := data["grade"]; ok {
		switch val := v.(type) {
		case float64: updates["grade"] = int(val)
		case int: updates["grade"] = val
		}
	}
	if v, ok := data["class_num"]; ok {
		switch val := v.(type) {
		case float64: updates["class_num"] = int(val)
		case int: updates["class_num"] = val
		}
	}
	
	p.db.Model(&PCRecord{}).Where("id = ? AND school_id = ?", id, schoolID).Updates(updates)
	return c.JSON(fiber.Map{"message": "updated"})
}

func (p *Plugin) delete(c *fiber.Ctx) error {
	id, _ := uuid.Parse(c.Params("id"))
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	
	p.db.Where("id = ? AND school_id = ?", id, schoolID).Delete(&PCRecord{})
	return c.JSON(fiber.Map{"message": "deleted"})
}
