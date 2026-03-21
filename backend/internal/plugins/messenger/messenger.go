package messenger

import (
	"log"
	"time"

	"github.com/edulinker/backend/internal/core/notify"
	"github.com/edulinker/backend/internal/database/models"
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
	ChatID    uuid.UUID `json:"chat_id" gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `json:"user_id" gorm:"type:uuid;primaryKey"`
	JoinedAt  time.Time `json:"joined_at" gorm:"autoCreateTime"`
	IsDeleted bool      `json:"is_deleted" gorm:"default:false"`
}

type Message struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	ChatID      uuid.UUID  `json:"chat_id" gorm:"type:uuid;index"`
	SenderID    uuid.UUID  `json:"sender_id" gorm:"type:uuid"`
	SenderName  string     `json:"sender_name" gorm:"-"` // computed, not stored
	Content     string     `json:"content" gorm:"type:text;not null"`
	MessageType string     `json:"message_type" gorm:"type:varchar(20);default:'text'"` // text, image, file
	FileID      *uuid.UUID `json:"file_id,omitempty" gorm:"type:uuid"`
	IsUrgent    bool       `json:"is_urgent" gorm:"default:false"`
	CreatedAt   time.Time  `json:"created_at" gorm:"autoCreateTime"`
	ReadCount   int64      `json:"read_count" gorm:"-"` // computed, not stored
}

type MessageReadReceipt struct {
	MessageID uuid.UUID `json:"message_id" gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `json:"user_id" gorm:"type:uuid;primaryKey"`
	ReadAt    time.Time `json:"read_at" gorm:"autoCreateTime"`
}

type ChatResponse struct {
	Chat
	Participants    []string `json:"participants"`
	ParticipantIDs  []string `json:"participant_ids"`
	LastMessage     string   `json:"last_message,omitempty"`
	LastSenderName  string   `json:"last_sender_name,omitempty"`
	LastMessageTime string   `json:"last_message_time,omitempty"`
	UnreadCount     int64    `json:"unread_count"`
}

func getChatResponse(db *gorm.DB, chat Chat) ChatResponse {
	var members []ChatMember
	db.Where("chat_id = ?", chat.ID).Find(&members)

	var userIDs []uuid.UUID
	for _, m := range members {
		userIDs = append(userIDs, m.UserID)
	}

	var users []models.User
	if len(userIDs) > 0 {
		db.Where("id IN ?", userIDs).Find(&users)
	}

	var parts []string
	var partIDs []string
	for _, u := range users {
		parts = append(parts, u.Name)
		partIDs = append(partIDs, u.ID.String())
	}

	return ChatResponse{
		Chat:           chat,
		Participants:   parts,
		ParticipantIDs: partIDs,
	}
}

// ── Plugin ──

type Plugin struct {
	db  *gorm.DB
	hub *notify.Hub
}

func New(db *gorm.DB, hub *notify.Hub) *Plugin {
	// Auto-migrate messenger tables
	db.AutoMigrate(&Chat{}, &ChatMember{}, &Message{}, &MessageReadReceipt{})
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
	r.Delete("/chats/:chatId", p.deleteChat)
	r.Get("/chats/:chatId/messages", p.getMessages)
	r.Post("/chats/:chatId/messages", p.sendMessage)
	r.Post("/chats/:chatId/members", p.addMember)
	r.Put("/chats/:chatId/read", p.markRead)
	r.Get("/unread-total", p.getUnreadTotal)
}

// ── Handlers ──

func (p *Plugin) listChats(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)

	var memberEntries []ChatMember
	p.db.Where("user_id = ? AND is_deleted = ?", userID, false).Find(&memberEntries)

	chatIDs := make([]uuid.UUID, len(memberEntries))
	for i, m := range memberEntries {
		chatIDs[i] = m.ChatID
	}

	if len(chatIDs) == 0 {
		return c.JSON([]Chat{})
	}

	var chats []Chat
	p.db.Where("id IN ?", chatIDs).Order("updated_at DESC").Find(&chats)

	// Fetch all members for these chats to include participant names
	var allMembers []ChatMember
	p.db.Where("chat_id IN ?", chatIDs).Find(&allMembers)

	var userIDs []uuid.UUID
	for _, m := range allMembers {
		userIDs = append(userIDs, m.UserID)
	}

	var users []models.User
	if len(userIDs) > 0 {
		p.db.Where("id IN ?", userIDs).Find(&users)
	}

	userMap := make(map[uuid.UUID]string)
	for _, u := range users {
		userMap[u.ID] = u.Name
	}

	chatParts := make(map[uuid.UUID][]string)
	chatPartIDs := make(map[uuid.UUID][]string)
	for _, m := range allMembers {
		if name, ok := userMap[m.UserID]; ok {
			chatParts[m.ChatID] = append(chatParts[m.ChatID], name)
			chatPartIDs[m.ChatID] = append(chatPartIDs[m.ChatID], m.UserID.String())
		}
	}

	// Fetch last message for each chat
	type lastMsgRow struct {
		ChatID    uuid.UUID
		Content   string
		SenderID  uuid.UUID
		CreatedAt time.Time
	}
	var lastMsgs []lastMsgRow
	// Get the latest message per chat using a subquery
	p.db.Raw(`
		SELECT m.chat_id, m.content, m.sender_id, m.created_at
		FROM messages m
		INNER JOIN (
			SELECT chat_id, MAX(created_at) as max_created
			FROM messages
			WHERE chat_id IN ?
			GROUP BY chat_id
		) latest ON m.chat_id = latest.chat_id AND m.created_at = latest.max_created
	`, chatIDs).Scan(&lastMsgs)

	lastMsgMap := make(map[uuid.UUID]lastMsgRow)
	for _, lm := range lastMsgs {
		lastMsgMap[lm.ChatID] = lm
	}

	// Calculate unread count per chat: messages not sent by me, without my read receipt
	type unreadRow struct {
		ChatID uuid.UUID
		Cnt    int64
	}
	var unreadRows []unreadRow
	p.db.Raw(`
		SELECT m.chat_id, COUNT(*) as cnt
		FROM messages m
		WHERE m.chat_id IN ?
		  AND m.sender_id != ?
		  AND m.id NOT IN (
			SELECT message_id FROM message_read_receipts WHERE user_id = ?
		  )
		GROUP BY m.chat_id
	`, chatIDs, userID, userID).Scan(&unreadRows)

	unreadMap := make(map[uuid.UUID]int64)
	for _, r := range unreadRows {
		unreadMap[r.ChatID] = r.Cnt
	}

	responses := make([]ChatResponse, len(chats))
	for i, chat := range chats {
		resp := ChatResponse{
			Chat:           chat,
			Participants:   chatParts[chat.ID],
			ParticipantIDs: chatPartIDs[chat.ID],
			UnreadCount:    unreadMap[chat.ID],
		}
		if lm, ok := lastMsgMap[chat.ID]; ok {
			resp.LastMessage = lm.Content
			resp.LastSenderName = userMap[lm.SenderID]
			resp.LastMessageTime = lm.CreatedAt.Format(time.RFC3339)
		}
		responses[i] = resp
	}

	return c.JSON(responses)
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

	// Check for existing chat with the same members to prevent duplicates
	{
		// Build full member list including creator
		allMemberIDs := make([]uuid.UUID, 0, len(req.Members)+1)
		seen := make(map[uuid.UUID]bool)
		seen[userID] = true
		allMemberIDs = append(allMemberIDs, userID)
		for _, mid := range req.Members {
			if !seen[mid] {
				seen[mid] = true
				allMemberIDs = append(allMemberIDs, mid)
			}
		}
		memberCount := len(allMemberIDs)

		// Find all chats where the current user is a member (including soft-deleted)
		var myChatIDs []uuid.UUID
		p.db.Model(&ChatMember{}).
			Select("chat_id").
			Where("user_id = ?", userID).
			Pluck("chat_id", &myChatIDs)

		for _, cid := range myChatIDs {
			// Check chat type matches
			var chat Chat
			if p.db.Where("id = ? AND type = ?", cid, req.Type).First(&chat).Error != nil {
				continue
			}
			// Check member count matches exactly (count all members regardless of is_deleted)
			var cnt int64
			p.db.Model(&ChatMember{}).Where("chat_id = ?", cid).Count(&cnt)
			if int(cnt) != memberCount {
				continue
			}
			// Check all members match
			var matchCnt int64
			p.db.Model(&ChatMember{}).Where("chat_id = ? AND user_id IN ?", cid, allMemberIDs).Count(&matchCnt)
			if int(matchCnt) == memberCount {
				// Existing chat found — re-activate this user's membership and return it
				p.db.Model(&ChatMember{}).Where("chat_id = ? AND user_id = ?", cid, userID).Update("is_deleted", false)
				return c.JSON(getChatResponse(p.db, chat))
			}
		}
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

	return c.Status(201).JSON(getChatResponse(p.db, chat))
}

// deleteChat hides a chat for the current user.
// Only the chat creator or a member can delete their own view.
func (p *Plugin) deleteChat(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid chat ID"})
	}

	// Verify the user is a member of this chat
	var member ChatMember
	if p.db.Where("chat_id = ? AND user_id = ?", chatID, userID).First(&member).Error != nil {
		return c.Status(403).JSON(fiber.Map{"error": "이 채팅방의 멤버가 아닙니다"})
	}

	// Soft delete for this user only
	p.db.Model(&ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Update("is_deleted", true)

	// Optional: Delete read receipts for messages in this chat
	var msgIDs []uuid.UUID
	p.db.Model(&Message{}).Where("chat_id = ?", chatID).Pluck("id", &msgIDs)
	if len(msgIDs) > 0 {
		p.db.Where("message_id IN ? AND user_id = ?", msgIDs, userID).Delete(&MessageReadReceipt{})
	}

	return c.JSON(fiber.Map{"message": "채팅방이 삭제되었습니다"})
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

	// Populate read counts and sender names
	if len(messages) > 0 {
		msgIDs := make([]uuid.UUID, len(messages))
		senderIDSet := make(map[uuid.UUID]bool)
		for i, m := range messages {
			msgIDs[i] = m.ID
			senderIDSet[m.SenderID] = true
		}

		// Read counts
		type readCountRow struct {
			MessageID uuid.UUID
			Cnt       int64
		}
		var rows []readCountRow
		p.db.Model(&MessageReadReceipt{}).
			Select("message_id, count(*) as cnt").
			Where("message_id IN ?", msgIDs).
			Group("message_id").
			Find(&rows)

		countMap := make(map[uuid.UUID]int64, len(rows))
		for _, r := range rows {
			countMap[r.MessageID] = r.Cnt
		}

		// Sender names
		senderIDs := make([]uuid.UUID, 0, len(senderIDSet))
		for id := range senderIDSet {
			senderIDs = append(senderIDs, id)
		}
		var senders []models.User
		p.db.Where("id IN ?", senderIDs).Find(&senders)
		nameMap := make(map[uuid.UUID]string, len(senders))
		for _, s := range senders {
			nameMap[s.ID] = s.Name
		}

		for i := range messages {
			messages[i].ReadCount = countMap[messages[i].ID]
			messages[i].SenderName = nameMap[messages[i].SenderID]
		}
	}

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

	// If direct chat, re-activate any members who soft-deleted it
	var chat Chat
	if p.db.First(&chat, "id = ?", chatID).Error == nil && chat.Type == ChatDirect {
		p.db.Model(&ChatMember{}).Where("chat_id = ?", chatID).Update("is_deleted", false)
	} else {
		// For groups, always reactivate the sender just in case they sent a message after leaving
		p.db.Model(&ChatMember{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Update("is_deleted", false)
	}

	// Broadcast via WebSocket to chat members
	log.Printf("📤 [Messenger] sendMessage: hub=%v, chatID=%s, senderID=%s", p.hub != nil, chatID, userID)
	if p.hub != nil {
		var members []ChatMember
		p.db.Where("chat_id = ? AND user_id != ?", chatID, userID).Find(&members)

		recipientIDs := make([]uuid.UUID, len(members))
		for i, m := range members {
			recipientIDs[i] = m.UserID
		}
		log.Printf("📤 [Messenger] broadcasting to %d recipients: %v", len(recipientIDs), recipientIDs)

		// Look up sender name
		var sender models.User
		p.db.Where("id = ?", userID).First(&sender)

		p.hub.Broadcast(&notify.WSMessage{
			Type:     notify.MsgTypeChat,
			PluginID: "messenger",
			From:     userID,
			To:       recipientIDs,
			Payload: map[string]interface{}{
				"action":       "new_message",
				"chat_id":      chatID,
				"message_id":   msg.ID,
				"sender_id":    userID,
				"sender_name":  sender.Name,
				"content":      msg.Content,
				"message_type": msg.MessageType,
				"is_urgent":    msg.IsUrgent,
				"created_at":   msg.CreatedAt,
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

// markRead marks all unread messages in a chat as read by the current user
func (p *Plugin) markRead(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	chatID, err := uuid.Parse(c.Params("chatId"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid chat ID"})
	}

	// Get all messages in this chat not sent by current user that haven't been read
	var unreadMsgIDs []uuid.UUID
	err = p.db.Raw(`
		SELECT m.id 
		FROM messages m
		LEFT JOIN message_read_receipts r ON r.message_id = m.id AND r.user_id = ?
		WHERE m.chat_id = ? AND m.sender_id != ? AND r.message_id IS NULL
	`, userID, chatID, userID).Scan(&unreadMsgIDs).Error

	if err != nil || len(unreadMsgIDs) == 0 {
		return c.JSON(fiber.Map{"marked": 0})
	}

	// Batch create read receipts
	receipts := make([]MessageReadReceipt, len(unreadMsgIDs))
	for i, msgID := range unreadMsgIDs {
		receipts[i] = MessageReadReceipt{MessageID: msgID, UserID: userID}
	}
	p.db.Create(&receipts)

	// Notify the senders that their messages have been read
	if p.hub != nil {
		// Find unique senders of those messages
		var senderIDs []uuid.UUID
		p.db.Model(&Message{}).
			Where("id IN ?", unreadMsgIDs).
			Distinct("sender_id").
			Pluck("sender_id", &senderIDs)

		if len(senderIDs) > 0 {
			p.hub.Broadcast(&notify.WSMessage{
				Type:     notify.MsgTypeChat,
				PluginID: "messenger",
				From:     userID,
				To:       senderIDs,
				Payload: map[string]interface{}{
					"action":  "read_receipt",
					"chat_id": chatID,
					"reader":  userID,
					"count":   len(unreadMsgIDs),
				},
			})
		}
	}

	return c.JSON(fiber.Map{"marked": len(unreadMsgIDs)})
}

func (p *Plugin) getUnreadTotal(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)

	// Get all chats the user is a member of
	var chatIDs []uuid.UUID
	p.db.Model(&ChatMember{}).
		Where("user_id = ? AND is_deleted = ?", userID, false).
		Pluck("chat_id", &chatIDs)

	if len(chatIDs) == 0 {
		return c.JSON(fiber.Map{"total": 0})
	}

	var total int64
	p.db.Raw(`
		SELECT COUNT(*)
		FROM messages m
		WHERE m.chat_id IN ?
		  AND m.sender_id != ?
		  AND m.id NOT IN (
			SELECT message_id FROM message_read_receipts WHERE user_id = ?
		  )
	`, chatIDs, userID, userID).Scan(&total)

	return c.JSON(fiber.Map{"total": total})
}
