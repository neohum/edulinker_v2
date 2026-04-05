package sendoc

import (
	"encoding/json"
	"log"
	"sort"
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

// ── SyncProvider Implementation ──

func (p *Plugin) GetSyncData(schoolID string) interface{} {
	type SendocPublic struct {
		ID                uuid.UUID   `json:"id"`
		Title             string      `json:"title"`
		Description       string      `json:"description,omitempty"`
		BackgroundURL     string      `json:"background_url,omitempty"`
		FieldsJSON        string      `json:"fields_json,omitempty"`
		RequiresSignature bool        `json:"requires_signature"`
		CreatedAt         time.Time   `json:"created_at"`
		TargetUserIDs     []uuid.UUID `json:"target_user_ids"`
		Author            *struct {
			Name string `json:"name"`
		} `json:"author,omitempty"`
	}

	var docs []models.Sendoc
	// Fetch all documents and their recipients for this school
	p.db.Preload("Author").Preload("Recipients").Where("school_id = ?", schoolID).Order("created_at desc").Find(&docs)

	var result []SendocPublic
	for _, d := range docs {
		var uids []uuid.UUID
		for _, r := range d.Recipients {
			uids = append(uids, r.UserID)
		}

		doc := SendocPublic{
			ID:                d.ID,
			Title:             d.Title,
			Description:       d.Content,
			BackgroundURL:     d.BackgroundURL,
			FieldsJSON:        d.FieldsJSON,
			RequiresSignature: d.RequiresSignature,
			CreatedAt:         d.CreatedAt,
			TargetUserIDs:     uids,
		}
		if d.Author.Name != "" {
			doc.Author = &struct {
				Name string `json:"name"`
			}{Name: d.Author.Name}
		}
		result = append(result, doc)
	}
	return result
}

func (p *Plugin) HandleEvent(payload string) error {
	var ev struct {
		Type              string `json:"type"`
		DocID             string `json:"doc_id"`
		UserID            string `json:"user_id"`
		SignatureImageURL string `json:"signature_image_url"`
		FormDataJSON      string `json:"form_data_json"`
	}
	if err := json.Unmarshal([]byte(payload), &ev); err != nil {
		log.Printf("[Sendoc] HandleEvent parse error: %v", err)
		return err
	}

	if ev.Type == "sendoc_sign" {
		docID, err := uuid.Parse(ev.DocID)
		if err != nil {
			return err
		}
		userID, err := uuid.Parse(ev.UserID)
		if err != nil {
			return err
		}

		now := time.Now()
		result := p.db.Model(&models.SendocRecipient{}).
			Where("sendoc_id = ? AND user_id = ?", docID, userID).
			Updates(map[string]interface{}{
				"is_signed":           true,
				"signature_image_url": ev.SignatureImageURL,
				"form_data_json":      ev.FormDataJSON,
				"signed_at":           &now,
			})
		if result.Error != nil {
			log.Printf("[Sendoc] HandleEvent sign error: %v", result.Error)
			return result.Error
		}
		log.Printf("[Sendoc] HandleEvent: signature submitted for doc=%s user=%s (rows=%d)", ev.DocID, ev.UserID, result.RowsAffected)
	}
	return nil
}

func (p *Plugin) RegisterRoutes(router fiber.Router) {
	// Signer endpoints (Read/Write access for Parents/Students) - view docs and submit signatures
	// MUST be registered before /:id dynamic routes to avoid path conflicts
	signerAPI := router.Group("/sign", middleware.RoleMiddleware(models.RoleParent, models.RoleStudent, models.RoleTeacher))
	signerAPI.Get("", p.listPendingDocuments)
	signerAPI.Get("/:id", p.getPendingDocument)
	signerAPI.Post("/:id/submit", p.submitSignature)
	signerAPI.Delete("/:id", p.deletePendingDocument)

	// Teacher endpoints (Write access) - create documents and monitor signatures
	teacherAPI := router.Group("/", middleware.RoleMiddleware(models.RoleTeacher))
	teacherAPI.Post("", p.createDocument)
	teacherAPI.Get("", p.listDocuments)
	teacherAPI.Get("/:id", p.getDocument)
	teacherAPI.Get("/:id/signatures", p.getSignatures)
	teacherAPI.Get("/:id/pdf", p.downloadPDF)
	teacherAPI.Delete("/:id", p.deleteDocument)
	teacherAPI.Put("/:id/recall", p.recallDocument)
	teacherAPI.Put("/:id", p.updateDocument)
}

func (p *Plugin) RegisterPublicRoutes(router fiber.Router) {
	router.Post("/sign/:id/submit", p.publicSubmitSignature)
}

// ── Handlers ──

func (p *Plugin) createDocument(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var req struct {
		Title             string      `json:"title"`
		Content           string      `json:"content"`
		BackgroundURL     string      `json:"background_url"`
		FieldsJSON        string      `json:"fields_json"`
		RequiresSignature bool        `json:"requires_signature"`
		TargetUserIDs     []uuid.UUID `json:"target_user_ids"`
		IsDraft           bool        `json:"is_draft"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request payload"})
	}

	status := "sent"
	if req.IsDraft {
		status = "draft"
	}

	doc := models.Sendoc{
		SchoolID:          schoolID,
		AuthorID:          &userID,
		Title:             req.Title,
		Content:           req.Content,
		BackgroundURL:     req.BackgroundURL,
		FieldsJSON:        req.FieldsJSON,
		RequiresSignature: req.RequiresSignature,
		Status:            status,
	}

	if err := p.db.Create(&doc).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create document"})
	}

	// Always include the author themselves if they are not in the list,
	// so the sender also gets a copy in their "Received Documents" to sign.
	hasAuthor := false
	for _, targetID := range req.TargetUserIDs {
		if targetID == userID {
			hasAuthor = true
			break
		}
	}
	if !hasAuthor {
		req.TargetUserIDs = append(req.TargetUserIDs, userID)
	}

	// Create recipients using Bulk Insert for maximum performance
	var recipients []models.SendocRecipient
	for _, targetID := range req.TargetUserIDs {
		recipients = append(recipients, models.SendocRecipient{
			SendocID: doc.ID,
			UserID:   targetID,
		})
	}

	if len(recipients) > 0 {
		if err := p.db.CreateInBatches(&recipients, 100).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to insert recipients"})
		}
	}

	return c.Status(fiber.StatusCreated).JSON(doc)
}

func (p *Plugin) updateDocument(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	docID := c.Params("id")

	var req struct {
		Title             string      `json:"title"`
		Content           string      `json:"content"`
		BackgroundURL     string      `json:"background_url"`
		FieldsJSON        string      `json:"fields_json"`
		RequiresSignature bool        `json:"requires_signature"`
		TargetUserIDs     []uuid.UUID `json:"target_user_ids"`
		IsDraft           bool        `json:"is_draft"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request payload"})
	}

	var doc models.Sendoc
	if err := p.db.Where("id = ? AND school_id = ? AND author_id = ?", docID, schoolID, userID).First(&doc).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found or permission denied"})
	}

	if doc.Status != "draft" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only draft documents can be updated"})
	}

	doc.Title = req.Title
	if req.Content != "" {
		doc.Content = req.Content
	}
	doc.BackgroundURL = req.BackgroundURL
	doc.FieldsJSON = req.FieldsJSON
	doc.RequiresSignature = req.RequiresSignature

	if req.IsDraft {
		doc.Status = "draft"
	} else {
		doc.Status = "sent"
		// If it is finally being sent, we set the date
		doc.CreatedAt = time.Now()
	}

	tx := p.db.Begin()
	if tx.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to start transaction"})
	}

	if err := tx.Save(&doc).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update document"})
	}

	// Always clear out existing recipients for a draft update to replace them
	tx.Where("sendoc_id = ?", doc.ID).Delete(&models.SendocRecipient{})

	// Always include the author themselves if they are not in the list
	hasAuthor := false
	for _, targetID := range req.TargetUserIDs {
		if targetID == userID {
			hasAuthor = true
			break
		}
	}
	if !hasAuthor {
		req.TargetUserIDs = append(req.TargetUserIDs, userID)
	}

	var recipients []models.SendocRecipient
	for _, targetID := range req.TargetUserIDs {
		recipients = append(recipients, models.SendocRecipient{
			SendocID: doc.ID,
			UserID:   targetID,
		})
	}

	if len(recipients) > 0 {
		if err := tx.CreateInBatches(&recipients, 100).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update recipients"})
		}
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to commit transaction"})
	}

	return c.JSON(doc)
}

func (p *Plugin) listDocuments(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var docs []models.Sendoc
	if err := p.db.Omit("BackgroundURL", "FieldsJSON", "Content").Preload("Author").Where("school_id = ? AND author_id = ?", schoolID, userID).Order("created_at desc").Find(&docs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch documents"})
	}

	return c.JSON(docs)
}

func (p *Plugin) getDocument(c *fiber.Ctx) error {
	docID := c.Params("id")
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var doc models.Sendoc
	if err := p.db.Preload("Author").Where("id = ? AND school_id = ?", docID, schoolID).First(&doc).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found"})
	}

	return c.JSON(doc)
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
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var allRecipients []models.SendocRecipient
	if err := p.db.Preload("User").
		Preload("Sendoc").
		Preload("Sendoc.Author").
		Where("user_id = ?", userID).
		Find(&allRecipients).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch your documents"})
	}

	var recipients []models.SendocRecipient
	for _, r := range allRecipients {
		// If Sendoc is not loaded (deleted manually or soft deleted) or recalled/draft, skip it
		if r.Sendoc.ID == uuid.Nil || r.Sendoc.Status == "recalled" || r.Sendoc.Status == "draft" {
			continue
		}
		recipients = append(recipients, r)
	}

	// Sort the valid recipients by Sendoc.CreatedAt descending
	sort.Slice(recipients, func(i, j int) bool {
		return recipients[i].Sendoc.CreatedAt.After(recipients[j].Sendoc.CreatedAt)
	})

	for _, r := range recipients {
		if r.Sendoc.ID == uuid.Nil {
			log.Printf("[Sendoc] WARNING: Sendoc preload returned nil/empty for recipient ID: %s", r.ID.String())
		}
	}

	// Map to flat structure for frontend compatibility
	type PendingDoc struct {
		ID            uuid.UUID  `json:"id"`
		Title         string     `json:"title"`
		Status        string     `json:"status"`
		BackgroundURL string     `json:"background_url"`
		FieldsJSON    string     `json:"fields_json"`
		FormDataJSON  string     `json:"form_data_json,omitempty"`
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
			FormDataJSON:  r.FormDataJSON,
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

func (p *Plugin) getPendingDocument(c *fiber.Ctx) error {
	docID := c.Params("id")
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var recipient models.SendocRecipient
	if err := p.db.Preload("User").Preload("Sendoc").Preload("Sendoc.Author").
		Joins("JOIN sendocs ON sendocs.id = sendoc_recipients.sendoc_id").
		Where("sendoc_recipients.user_id = ? AND sendoc_recipients.sendoc_id = ?", userID, docID).
		First(&recipient).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found"})
	}

	type PendingDoc struct {
		ID            uuid.UUID  `json:"id"`
		Title         string     `json:"title"`
		Status        string     `json:"status"`
		BackgroundURL string     `json:"background_url"`
		FieldsJSON    string     `json:"fields_json"`
		FormDataJSON  string     `json:"form_data_json,omitempty"`
		CreatedAt     time.Time  `json:"created_at"`
		IsSigned      bool       `json:"is_signed"`
		SignedAt      *time.Time `json:"signed_at,omitempty"`
		Author        *struct {
			Name string `json:"name"`
		} `json:"author,omitempty"`
	}

	doc := PendingDoc{
		ID:            recipient.Sendoc.ID,
		Title:         recipient.Sendoc.Title,
		Status:        recipient.Sendoc.Status,
		BackgroundURL: recipient.Sendoc.BackgroundURL,
		FieldsJSON:    recipient.Sendoc.FieldsJSON,
		FormDataJSON:  recipient.FormDataJSON,
		CreatedAt:     recipient.Sendoc.CreatedAt,
		IsSigned:      recipient.IsSigned,
		SignedAt:      recipient.SignedAt,
	}
	if recipient.Sendoc.Author.Name != "" {
		doc.Author = &struct {
			Name string `json:"name"`
		}{Name: recipient.Sendoc.Author.Name}
	}

	return c.JSON(doc)
}

func (p *Plugin) submitSignature(c *fiber.Ctx) error {
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	docID := c.Params("id")

	var req struct {
		SignatureImageURL string `json:"signature_image_url"`
		FormDataJSON      string `json:"form_data_json"`
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
			"form_data_json":      req.FormDataJSON,
			"signed_at":           &now,
		})

	if result.Error != nil || result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "recipient record not found or update failed"})
	}

	return c.JSON(fiber.Map{"message": "signature submitted successfully"})
}

func (p *Plugin) publicSubmitSignature(c *fiber.Ctx) error {
	docID := c.Params("id")

	var req struct {
		UserID            string `json:"user_id"`
		SignatureImageURL string `json:"signature_image_url"`
		FormDataJSON      string `json:"form_data_json"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	parsedDocID, err := uuid.Parse(docID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid document id"})
	}

	var userID uuid.UUID
	if req.UserID != "" {
		if uid, err := uuid.Parse(req.UserID); err == nil {
			userID = uid
		}
	}

	if userID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user_id is required for public submissions"})
	}

	now := time.Now()
	result := p.db.Model(&models.SendocRecipient{}).
		Where("sendoc_id = ? AND user_id = ?", parsedDocID, userID).
		Updates(map[string]interface{}{
			"is_signed":           true,
			"signature_image_url": req.SignatureImageURL,
			"form_data_json":      req.FormDataJSON,
			"signed_at":           &now,
		})

	if result.Error != nil || result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "recipient record not found or update failed"})
	}

	return c.JSON(fiber.Map{"message": "signature submitted successfully"})
}

func (p *Plugin) downloadPDF(c *fiber.Ctx) error {
	docID := c.Params("id")
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

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

func (p *Plugin) deleteDocument(c *fiber.Ctx) error {
	docID := c.Params("id")
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var doc models.Sendoc
	if err := p.db.Where("id = ? AND school_id = ? AND author_id = ?", docID, schoolID, userID).First(&doc).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found or permission denied"})
	}

	// Soft delete the document (and GORM will cascade if configured, but deleting parent hides it anyway)
	if err := p.db.Delete(&doc).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete document"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

func (p *Plugin) recallDocument(c *fiber.Ctx) error {
	docID := c.Params("id")
	schoolID, ok := c.Locals("schoolID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var doc models.Sendoc
	if err := p.db.Where("id = ? AND school_id = ? AND author_id = ?", docID, schoolID, userID).First(&doc).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "document not found or permission denied"})
	}

	if doc.Status == "draft" {
		return c.JSON(fiber.Map{"status": "already_recalled"})
	}

	doc.Status = "draft"
	if err := p.db.Save(&doc).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to recall document"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

func (p *Plugin) deletePendingDocument(c *fiber.Ctx) error {
	docID := c.Params("id")
	userID, ok := c.Locals("userID").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var recipient models.SendocRecipient
	if err := p.db.Where("sendoc_id = ? AND user_id = ?", docID, userID).First(&recipient).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "recipient record not found"})
	}

	// Soft delete the recipient record so it disappears from their pending/received list
	if err := p.db.Delete(&recipient).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete document from list"})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}
