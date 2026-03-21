package sendoc

import (
	"log"
	"time"

	"github.com/edulinker/backend/internal/core/middleware"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jung-kurt/gofpdf"
	"gorm.io/gorm"
)

type Plugin struct {
	db *gorm.DB
}

func New(db *gorm.DB) *Plugin {
	return &Plugin{db: db}
}

func (p *Plugin) ID() string      { return "sendoc" }
func (p *Plugin) Name() string    { return "전자문서·서명" }
func (p *Plugin) Group() string   { return "B" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error {
	log.Printf("[Sendoc] Enabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) OnDisable(schoolID uuid.UUID) error {
	log.Printf("[Sendoc] Disabled for school: %s", schoolID)
	return nil
}

func (p *Plugin) RegisterRoutes(router fiber.Router) {
	// Teacher endpoints (Write access) - create documents and monitor signatures
	teacherAPI := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher))
	teacherAPI.Post("/", p.createDocument)
	teacherAPI.Get("/", p.listDocuments)
	teacherAPI.Get("/:id/signatures", p.getSignatures)
	teacherAPI.Get("/:id/pdf", p.downloadPDF)

	// Signer endpoints (Read/Write access for Parents/Students) - view docs and submit signatures
	signerAPI := router.Group("/sign", middleware.RoleMiddleware(models.RoleParent, models.RoleStudent, models.RoleTeacher))
	signerAPI.Get("/", p.listPendingDocuments)
	signerAPI.Post("/:id/submit", p.submitSignature)
}

// ── Handlers ──

func (p *Plugin) createDocument(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var req struct {
		Title             string      `json:"title"`
		Content           string      `json:"content"`
		BackgroundURL     string      `json:"background_url"`
		FieldsJSON        string      `json:"fields_json"`
		RequiresSignature bool        `json:"requires_signature"`
		TargetUserIDs     []uuid.UUID `json:"target_user_ids"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request payload"})
	}

	doc := models.Sendoc{
		SchoolID:          schoolID,
		AuthorID:          userID,
		Title:             req.Title,
		Content:           req.Content,
		BackgroundURL:     req.BackgroundURL,
		FieldsJSON:        req.FieldsJSON,
		RequiresSignature: req.RequiresSignature,
		Status:            "sent",
	}

	if err := p.db.Create(&doc).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create document"})
	}

	// Create recipients
	for _, targetID := range req.TargetUserIDs {
		recipient := models.SendocRecipient{
			SendocID: doc.ID,
			UserID:   targetID,
		}
		p.db.Create(&recipient)
	}

	return c.Status(fiber.StatusCreated).JSON(doc)
}

func (p *Plugin) listDocuments(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var docs []models.Sendoc
	if err := p.db.Preload("Author").Where("school_id = ? AND author_id = ?", schoolID, userID).Order("created_at desc").Find(&docs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch documents"})
	}

	return c.JSON(docs)
}

func (p *Plugin) getSignatures(c *fiber.Ctx) error {
	docID := c.Params("id")

	var recipients []models.SendocRecipient
	if err := p.db.Preload("User").Where("sendoc_id = ?", docID).Find(&recipients).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get signature status"})
	}

	return c.JSON(recipients)
}

func (p *Plugin) listPendingDocuments(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)

	var recipients []models.SendocRecipient
	if err := p.db.Preload("User").Preload("Sendoc").Preload("Sendoc.Author").
		Joins("JOIN sendocs ON sendocs.id = sendoc_recipients.sendoc_id").
		Where("sendoc_recipients.user_id = ?", userID).
		Order("sendocs.created_at desc").Find(&recipients).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch your documents"})
	}

	// Map to flat structure for frontend compatibility
	type PendingDoc struct {
		ID            uuid.UUID  `json:"id"`
		Title         string     `json:"title"`
		Status        string     `json:"status"`
		BackgroundURL string     `json:"background_url"`
		FieldsJSON    string     `json:"fields_json"`
		CreatedAt     time.Time  `json:"created_at"`
		IsSigned      bool       `json:"is_signed"`
		SignedAt      *time.Time `json:"signed_at,omitempty"`
		Author        *struct {
			Name string `json:"name"`
		} `json:"author,omitempty"`
	}

	var result []PendingDoc
	for _, r := range recipients {
		doc := PendingDoc{
			ID:            r.Sendoc.ID,
			Title:         r.Sendoc.Title,
			Status:        r.Sendoc.Status,
			BackgroundURL: r.Sendoc.BackgroundURL,
			FieldsJSON:    r.Sendoc.FieldsJSON,
			CreatedAt:     r.Sendoc.CreatedAt,
			IsSigned:      r.IsSigned,
			SignedAt:      r.SignedAt,
		}
		if r.Sendoc.Author.Name != "" {
			doc.Author = &struct {
				Name string `json:"name"`
			}{Name: r.Sendoc.Author.Name}
		}
		result = append(result, doc)
	}

	return c.JSON(result)
}

func (p *Plugin) submitSignature(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uuid.UUID)
	docID := c.Params("id")

	var req struct {
		SignatureImageURL string `json:"signature_image_url"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	parsedDocID, err := uuid.Parse(docID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid document id"})
	}

	now := time.Now()
	result := p.db.Model(&models.SendocRecipient{}).
		Where("sendoc_id = ? AND user_id = ?", parsedDocID, userID).
		Updates(map[string]interface{}{
			"is_signed":           true,
			"signature_image_url": req.SignatureImageURL,
			"signed_at":           &now,
		})

	if result.Error != nil || result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "recipient record not found or update failed"})
	}

	return c.JSON(fiber.Map{"message": "signature submitted successfully"})
}

func (p *Plugin) downloadPDF(c *fiber.Ctx) error {
	docID := c.Params("id")
	schoolID := c.Locals("schoolID").(uuid.UUID)

	var doc models.Sendoc
	if err := p.db.Where("id = ? AND school_id = ?", docID, schoolID).First(&doc).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found"})
	}

	var recipients []models.SendocRecipient
	p.db.Preload("User").Where("sendoc_id = ?", docID).Find(&recipients)

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddPage()

	// Note: For actual Korean support, we need to load a TTF font like NanumGothic.
	// pdf.AddUTF8Font("NanumGothic", "", "path/to/NanumGothic.ttf")
	// pdf.SetFont("NanumGothic", "", 16)
	// Fallback to standard font for demo purposes:
	pdf.SetFont("Arial", "B", 16)

	// Title placeholder (English characters will render correctly)
	pdf.Cell(40, 10, "Document Report ("+docID+")")
	pdf.Ln(12)

	pdf.SetFont("Arial", "", 12)
	// PDF Content
	pdf.MultiCell(0, 10, "Document content preview (Korean characters require TTF loading)", "", "L", false)
	pdf.Ln(10)

	pdf.SetFont("Arial", "B", 14)
	pdf.Cell(40, 10, "Signature Log:")
	pdf.Ln(10)

	pdf.SetFont("Arial", "", 12)
	for _, r := range recipients {
		status := "Pending"
		if r.IsSigned {
			status = "Signed at " + r.SignedAt.Format(time.RFC3339) + " (" + r.SignatureImageURL + ")"
		}

		// User name rendering mock
		userName := r.User.Name
		if userName == "" {
			userName = "User " + r.UserID.String()[:8]
		}

		line := "- " + userName + ": " + status
		pdf.Cell(0, 10, line)
		pdf.Ln(8)
	}

	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", "attachment; filename=document_"+docID+".pdf")

	return pdf.Output(c.Response().BodyWriter())
}
