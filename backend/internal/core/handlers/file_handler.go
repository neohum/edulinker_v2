package handlers

import (
	"fmt"
	"io"

	"github.com/edulinker/backend/internal/core/filegateway"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// FileHandler handles file upload/download endpoints.
type FileHandler struct {
	gw *filegateway.Gateway
}

func NewFileHandler(gw *filegateway.Gateway) *FileHandler {
	return &FileHandler{gw: gw}
}

// Upload handles file upload via multipart form.
func (h *FileHandler) Upload(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	userID, _ := c.Locals("userID").(uuid.UUID)

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file is required"})
	}

	pluginID := c.FormValue("plugin_id", "core")
	storageHint := c.FormValue("storage", "auto") // auto, local, cloud

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to open file"})
	}
	defer src.Close()

	record, err := h.gw.Upload(src, file, schoolID, userID, pluginID, storageHint)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(record)
}

// Download retrieves a file by ID.
func (h *FileHandler) Download(c *fiber.Ctx) error {
	fileID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file ID"})
	}

	record, reader, err := h.gw.Download(fileID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	defer reader.Close()

	// Read entire file to set Content-Length properly
	data, err := io.ReadAll(reader)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read file"})
	}

	c.Set("Content-Type", record.ContentType)
	c.Set("Content-Length", fmt.Sprintf("%d", len(data)))
	c.Set("Content-Disposition", "inline; filename=\""+record.FileName+"\"")

	return c.Send(data)
}

// Delete removes a file.
func (h *FileHandler) Delete(c *fiber.Ctx) error {
	fileID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file ID"})
	}

	if err := h.gw.Delete(fileID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "file deleted"})
}

// ListFiles lists files for a plugin.
func (h *FileHandler) ListFiles(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	pluginID := c.Query("plugin_id", "core")
	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 20)

	files, total, err := h.gw.ListByPlugin(schoolID, pluginID, page, pageSize)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list files"})
	}

	return c.JSON(fiber.Map{
		"files":     files,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}
