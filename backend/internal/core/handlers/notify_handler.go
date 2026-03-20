package handlers

import (
	"github.com/edulinker/backend/internal/core/notify"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// NotifyHandler handles notification API endpoints.
type NotifyHandler struct {
	svc *notify.NotificationService
}

func NewNotifyHandler(svc *notify.NotificationService) *NotifyHandler {
	return &NotifyHandler{svc: svc}
}

// SendNotification dispatches a notification (plugin → core → users).
func (h *NotifyHandler) SendNotification(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req notify.SendRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	req.SchoolID = schoolID

	if err := h.svc.Send(req); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to send notification"})
	}

	return c.JSON(fiber.Map{"message": "notification sent"})
}

// GetNotifications returns the current user's notifications.
func (h *NotifyHandler) GetNotifications(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)

	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 20)
	unreadOnly := c.QueryBool("unread_only", false)

	notifications, total, err := h.svc.GetUserNotifications(userID, page, pageSize, unreadOnly)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get notifications"})
	}

	return c.JSON(fiber.Map{
		"notifications": notifications,
		"total":         total,
		"page":          page,
		"page_size":     pageSize,
		"unread_count":  h.svc.UnreadCount(userID),
	})
}

// MarkRead marks a single notification as read.
func (h *NotifyHandler) MarkRead(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	notifID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid notification ID"})
	}

	if err := h.svc.MarkAsRead(notifID, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to mark as read"})
	}

	return c.JSON(fiber.Map{"message": "marked as read"})
}

// MarkAllRead marks all notifications as read for the current user.
func (h *NotifyHandler) MarkAllRead(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)

	if err := h.svc.MarkAllAsRead(userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to mark all as read"})
	}

	return c.JSON(fiber.Map{"message": "all marked as read"})
}
