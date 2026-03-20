package notify

import (
	"log"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// NotificationType categorizes notifications.
type NotificationType string

const (
	NotifyInfo    NotificationType = "info"
	NotifyWarning NotificationType = "warning"
	NotifyUrgent  NotificationType = "urgent"
)

// Notification represents a stored notification record.
type Notification struct {
	ID        uuid.UUID        `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID  uuid.UUID        `json:"school_id" gorm:"type:uuid;index"`
	UserID    uuid.UUID        `json:"user_id" gorm:"type:uuid;index"`
	PluginID  string           `json:"plugin_id" gorm:"type:varchar(50)"`
	Type      NotificationType `json:"type" gorm:"type:varchar(20);default:'info'"`
	Title     string           `json:"title" gorm:"type:varchar(200)"`
	Body      string           `json:"body" gorm:"type:text"`
	Data      string           `json:"data,omitempty" gorm:"type:jsonb;default:'{}'"`
	IsRead    bool             `json:"is_read" gorm:"default:false"`
	ReadAt    *time.Time       `json:"read_at,omitempty"`
	CreatedAt time.Time        `json:"created_at" gorm:"autoCreateTime"`
}

// SendRequest is the payload for sending a notification.
type SendRequest struct {
	SchoolID   uuid.UUID              `json:"school_id"`
	Recipients []uuid.UUID            `json:"recipients"` // empty = broadcast to school
	PluginID   string                 `json:"plugin_id"`
	Type       NotificationType       `json:"type"`
	Title      string                 `json:"title"`
	Body       string                 `json:"body"`
	Data       map[string]interface{} `json:"data,omitempty"`
	Roles      []string               `json:"roles,omitempty"` // filter by role
}

// NotificationService manages notification dispatching and persistence.
type NotificationService struct {
	db  *gorm.DB
	hub *Hub
}

// NewNotificationService creates a new notification service.
func NewNotificationService(db *gorm.DB, hub *Hub) *NotificationService {
	return &NotificationService{db: db, hub: hub}
}

// Send dispatches a notification via WebSocket and persists it to DB.
func (s *NotificationService) Send(req SendRequest) error {
	recipients := req.Recipients

	// If no specific recipients, find users by school and optional role filter
	if len(recipients) == 0 {
		type userID struct{ ID uuid.UUID }
		var users []userID
		query := s.db.Table("users").Where("school_id = ? AND is_active = true", req.SchoolID)
		if len(req.Roles) > 0 {
			query = query.Where("role IN ?", req.Roles)
		}
		query.Select("id").Find(&users)

		for _, u := range users {
			recipients = append(recipients, u.ID)
		}
	}

	// Persist notification for each recipient
	for _, userID := range recipients {
		notif := Notification{
			SchoolID: req.SchoolID,
			UserID:   userID,
			PluginID: req.PluginID,
			Type:     req.Type,
			Title:    req.Title,
			Body:     req.Body,
		}
		if err := s.db.Create(&notif).Error; err != nil {
			log.Printf("⚠️ Failed to persist notification: %v", err)
		}
	}

	// Dispatch via WebSocket hub
	if s.hub != nil {
		wsMsg := &WSMessage{
			Type:     MsgTypeNotification,
			PluginID: req.PluginID,
			To:       recipients,
			Payload: map[string]interface{}{
				"type":  req.Type,
				"title": req.Title,
				"body":  req.Body,
				"data":  req.Data,
			},
		}
		s.hub.Broadcast(wsMsg)
	}

	log.Printf("🔔 Notification sent: %s → %d recipients", req.Title, len(recipients))
	return nil
}

// GetUserNotifications returns notifications for a user with pagination.
func (s *NotificationService) GetUserNotifications(userID uuid.UUID, page, pageSize int, unreadOnly bool) ([]Notification, int64, error) {
	query := s.db.Where("user_id = ?", userID)
	if unreadOnly {
		query = query.Where("is_read = false")
	}

	var total int64
	query.Model(&Notification{}).Count(&total)

	var notifications []Notification
	offset := (page - 1) * pageSize
	query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&notifications)

	return notifications, total, nil
}

// MarkAsRead marks a notification as read.
func (s *NotificationService) MarkAsRead(notifID, userID uuid.UUID) error {
	now := time.Now()
	return s.db.Model(&Notification{}).
		Where("id = ? AND user_id = ?", notifID, userID).
		Updates(map[string]interface{}{"is_read": true, "read_at": &now}).Error
}

// MarkAllAsRead marks all notifications for a user as read.
func (s *NotificationService) MarkAllAsRead(userID uuid.UUID) error {
	now := time.Now()
	return s.db.Model(&Notification{}).
		Where("user_id = ? AND is_read = false", userID).
		Updates(map[string]interface{}{"is_read": true, "read_at": &now}).Error
}

// UnreadCount returns the number of unread notifications for a user.
func (s *NotificationService) UnreadCount(userID uuid.UUID) int64 {
	var count int64
	s.db.Model(&Notification{}).Where("user_id = ? AND is_read = false", userID).Count(&count)
	return count
}
