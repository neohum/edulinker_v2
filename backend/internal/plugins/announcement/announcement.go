package announcement

import (
	"time"

	"github.com/edulinker/backend/internal/core/notify"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type AnnouncementType string

const (
	TypeSimple  AnnouncementType = "simple"  // 단순전달
	TypeConfirm AnnouncementType = "confirm" // 확인필요
	TypeApply   AnnouncementType = "apply"   // 신청필요
	TypeTodo    AnnouncementType = "todo"    // 관심→투두
)

type Announcement struct {
	ID        uuid.UUID        `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID  uuid.UUID        `json:"school_id" gorm:"type:uuid;index"`
	AuthorID  uuid.UUID        `json:"author_id" gorm:"type:uuid"`
	Type      AnnouncementType `json:"type" gorm:"type:varchar(20);default:'simple'"`
	Title     string           `json:"title" gorm:"type:varchar(200);not null"`
	Content   string           `json:"content" gorm:"type:text"`
	IsUrgent  bool             `json:"is_urgent" gorm:"default:false"`
	DueDate   *time.Time       `json:"due_date,omitempty"`
	CreatedAt time.Time        `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time        `json:"updated_at" gorm:"autoUpdateTime"`
}

type AnnouncementRead struct {
	AnnouncementID uuid.UUID  `json:"announcement_id" gorm:"type:uuid;primaryKey"`
	UserID         uuid.UUID  `json:"user_id" gorm:"type:uuid;primaryKey"`
	IsConfirmed    bool       `json:"is_confirmed" gorm:"default:false"`
	ConfirmedAt    *time.Time `json:"confirmed_at,omitempty"`
	ReadAt         time.Time  `json:"read_at" gorm:"autoCreateTime"`
}

// ── Plugin ──

type Plugin struct {
	db        *gorm.DB
	notifySvc *notify.NotificationService
}

func New(db *gorm.DB, notifySvc *notify.NotificationService) *Plugin {
	db.AutoMigrate(&Announcement{}, &AnnouncementRead{})
	return &Plugin{db: db, notifySvc: notifySvc}
}

func (p *Plugin) ID() string      { return "announcement" }
func (p *Plugin) Name() string    { return "공문전달" }
func (p *Plugin) Group() string   { return "A" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

// --- SyncProvider Implementation ---
func (p *Plugin) GetSyncData(schoolID string) interface{} {
	var announcements []Announcement
	p.db.Where("school_id = ?", schoolID).Order("created_at DESC").Limit(50).Find(&announcements)
	return announcements
}

func (p *Plugin) HandleEvent(payload string) error {
	// For example, student marked announcement as read
	return nil
}

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Get("/", p.list)
	r.Post("/", p.create)
	r.Get("/:id", p.getOne)
	r.Put("/:id/confirm", p.confirm)
	r.Get("/:id/status", p.readStatus)
}

// ── Handlers ──

func (p *Plugin) list(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	typeFilter := c.Query("type", "")
	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 20)

	query := p.db.Where("school_id = ?", schoolID)
	if typeFilter != "" {
		query = query.Where("type = ?", typeFilter)
	}

	var total int64
	query.Model(&Announcement{}).Count(&total)

	var announcements []Announcement
	offset := (page - 1) * pageSize
	query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&announcements)

	return c.JSON(fiber.Map{
		"announcements": announcements,
		"total":         total,
		"page":          page,
		"page_size":     pageSize,
	})
}

type CreateAnnouncementRequest struct {
	Type     AnnouncementType `json:"type"`
	Title    string           `json:"title"`
	Content  string           `json:"content"`
	IsUrgent bool             `json:"is_urgent"`
	DueDate  *time.Time       `json:"due_date"`
}

func (p *Plugin) create(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req CreateAnnouncementRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	if req.Type == "" {
		req.Type = TypeSimple
	}

	ann := Announcement{
		SchoolID: schoolID,
		AuthorID: userID,
		Type:     req.Type,
		Title:    req.Title,
		Content:  req.Content,
		IsUrgent: req.IsUrgent,
		DueDate:  req.DueDate,
	}
	p.db.Create(&ann)

	// Send notification to all teachers in the school
	if p.notifySvc != nil {
		nType := notify.NotifyInfo
		if req.IsUrgent {
			nType = notify.NotifyUrgent
		}
		p.notifySvc.Send(notify.SendRequest{
			SchoolID: schoolID,
			PluginID: "announcement",
			Type:     nType,
			Title:    "새 공문: " + req.Title,
			Body:     req.Content,
			Roles:    []string{"teacher"},
		})
	}

	return c.Status(201).JSON(ann)
}

func (p *Plugin) getOne(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid ID"})
	}
	userID, _ := c.Locals("userID").(uuid.UUID)

	var ann Announcement
	if p.db.First(&ann, "id = ?", id).Error != nil {
		return c.Status(404).JSON(fiber.Map{"error": "announcement not found"})
	}

	// Mark as read
	p.db.Where("announcement_id = ? AND user_id = ?", id, userID).
		FirstOrCreate(&AnnouncementRead{AnnouncementID: id, UserID: userID})

	return c.JSON(ann)
}

func (p *Plugin) confirm(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid ID"})
	}
	userID, _ := c.Locals("userID").(uuid.UUID)

	now := time.Now()
	var readRecord AnnouncementRead
	result := p.db.Where("announcement_id = ? AND user_id = ?", id, userID).First(&readRecord)
	if result.Error != nil {
		readRecord = AnnouncementRead{
			AnnouncementID: id,
			UserID:         userID,
			IsConfirmed:    true,
			ConfirmedAt:    &now,
		}
		p.db.Create(&readRecord)
	} else {
		p.db.Model(&readRecord).Updates(map[string]interface{}{
			"is_confirmed": true,
			"confirmed_at": &now,
		})
	}

	return c.JSON(fiber.Map{"message": "confirmed"})
}

func (p *Plugin) readStatus(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid ID"})
	}

	var reads []AnnouncementRead
	p.db.Where("announcement_id = ?", id).Find(&reads)

	confirmed := 0
	for _, r := range reads {
		if r.IsConfirmed {
			confirmed++
		}
	}

	return c.JSON(fiber.Map{
		"total_read": len(reads),
		"confirmed":  confirmed,
		"readers":    reads,
	})
}
