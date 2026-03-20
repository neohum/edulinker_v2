package messenger

import (
	"time"

	"github.com/edulinker/backend/internal/core/notify"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type ChatType string

const (
	ChatDirect  ChatType = "direct"
	ChatGroup   ChatType = "group"
	ChatChannel ChatType = "channel"
)

type Chat struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID  uuid.UUID `json:"school_id" gorm:"type:uuid;index"`
	Type      ChatType  `json:"type" gorm:"type:varchar(20);default:'direct'"`
	Name      string    `json:"name" gorm:"type:varchar(100)"`
	CreatedBy uuid.UUID `json:"created_by" gorm:"type:uuid"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}

type ChatMember struct {
	ChatID   uuid.UUID `json:"chat_id" gorm:"type:uuid;primaryKey"`
	UserID   uuid.UUID `json:"user_id" gorm:"type:uuid;primaryKey"`
	JoinedAt time.Time `json:"joined_at" gorm:"autoCreateTime"`
}

type Message struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	ChatID      uuid.UUID  `json:"chat_id" gorm:"type:uuid;index"`
	SenderID    uuid.UUID  `json:"sender_id" gorm:"type:uuid"`
	Content     string     `json:"content" gorm:"type:text;not null"`
	MessageType string     `json:"message_type" gorm:"type:varchar(20);default:'text'"` // text, image, file
	FileID      *uuid.UUID `json:"file_id,omitempty" gorm:"type:uuid"`
	IsUrgent    bool       `json:"is_urgent" gorm:"default:false"`
	CreatedAt   time.Time  `json:"created_at" gorm:"autoCreateTime"`
}

// ── Plugin ──

type Plugin struct {
	db  *gorm.DB
	hub *notify.Hub
}

func New(db *gorm.DB, hub *notify.Hub) *Plugin {
	// Auto-migrate messenger tables
	db.AutoMigrate(&Chat{}, &ChatMember{}, &Message{})
	return &Plugin{db: db, hub: hub}
}

func (p *Plugin) ID() string      { return "messenger" }
func (p *Plugin) Name() string    { return "교사 메신저" }
func (p *Plugin) Group() string   { return "A" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Get("/chats", p.listChats)
	r.Post("/chats", p.createChat)
	r.Get("/chats/:chatId/messages", p.getMessages)
	r.Post("/chats/:chatId/messages", p.sendMessage)
	r.Post("/chats/:chatId/members", p.addMember)
}

// ── Handlers ──

func (p *Plugin) listChats(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)

	var memberEntries []ChatMember
	p.db.Where("user_id = ?", userID).Find(&memberEntries)

	chatIDs := make([]uuid.UUID, len(memberEntries))
	for i, m := range memberEntries {
		chatIDs[i] = m.ChatID
	}

	if len(chatIDs) == 0 {
		return c.JSON([]Chat{})
	}

	var chats []Chat
	p.db.Where("id IN ?", chatIDs).Order("updated_at DESC").Find(&chats)

	return c.JSON(chats)
}

type CreateChatRequest struct {
	Type    ChatType    `json:"type"`
	Name    string      `json:"name"`
	Members []uuid.UUID `json:"members"`
}

func (p *Plugin) createChat(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req CreateChatRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	chat := Chat{
		SchoolID:  schoolID,
		Type:      req.Type,
		Name:      req.Name,
		CreatedBy: userID,
	}
	p.db.Create(&chat)

	// Add creator as member
	p.db.Create(&ChatMember{ChatID: chat.ID, UserID: userID})

	// Add other members
	for _, memberID := range req.Members {
		if memberID != userID {
			p.db.Create(&ChatMember{ChatID: chat.ID, UserID: memberID})
		}
	}

	return c.Status(201).JSON(chat)
}

func (p *Plugin) getMessages(c *fiber.Ctx) error {
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid chat ID"})
	}

	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 50)
	offset := (page - 1) * pageSize

	var messages []Message
	p.db.Where("chat_id = ?", chatID).Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&messages)

	return c.JSON(messages)
}

type SendMessageRequest struct {
	Content     string `json:"content"`
	MessageType string `json:"message_type"`
	IsUrgent    bool   `json:"is_urgent"`
}

func (p *Plugin) sendMessage(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid chat ID"})
	}

	var req SendMessageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	if req.MessageType == "" {
		req.MessageType = "text"
	}

	msg := Message{
		ChatID:      chatID,
		SenderID:    userID,
		Content:     req.Content,
		MessageType: req.MessageType,
		IsUrgent:    req.IsUrgent,
	}
	p.db.Create(&msg)

	// Update chat timestamp
	p.db.Model(&Chat{}).Where("id = ?", chatID).Update("updated_at", time.Now())

	// Broadcast via WebSocket to chat members
	if p.hub != nil {
		var members []ChatMember
		p.db.Where("chat_id = ? AND user_id != ?", chatID, userID).Find(&members)

		recipientIDs := make([]uuid.UUID, len(members))
		for i, m := range members {
			recipientIDs[i] = m.UserID
		}

		p.hub.Broadcast(&notify.WSMessage{
			Type:     notify.MsgTypeChat,
			PluginID: "messenger",
			From:     userID,
			To:       recipientIDs,
			Payload: map[string]interface{}{
				"chat_id":    chatID,
				"message_id": msg.ID,
				"content":    msg.Content,
				"is_urgent":  msg.IsUrgent,
			},
		})
	}

	return c.Status(201).JSON(msg)
}

func (p *Plugin) addMember(c *fiber.Ctx) error {
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid chat ID"})
	}

	var req struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	member := ChatMember{ChatID: chatID, UserID: req.UserID}
	p.db.Create(&member)

	return c.Status(201).JSON(fiber.Map{"message": "member added"})
}
