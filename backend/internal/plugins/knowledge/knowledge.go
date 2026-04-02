package knowledge

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ── Models ──

type DocumentRequest struct {
	Title            string `json:"title" form:"title"`
	SourceType       string `json:"source_type" form:"source_type"` // 'file' | 'text'
	OriginalFilename string `json:"original_filename" form:"original_filename"`
	Content          string `json:"content" form:"content"`
}

type QueryRequest struct {
	Query string `json:"query"`
}

type OllamaEmbedRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type OllamaEmbedResponse struct {
	Embedding []float64 `json:"embedding"`
}

type Plugin struct {
	db        *gorm.DB
	ollamaURL string
}

func New(db *gorm.DB, ollamaURL string) *Plugin {
	return &Plugin{db: db, ollamaURL: ollamaURL}
}

func (p *Plugin) ID() string      { return "knowledge" }
func (p *Plugin) Name() string    { return "업무 규칙/정보" }
func (p *Plugin) Group() string   { return "A" }
func (p *Plugin) Version() string { return "1.0.0" }

func (p *Plugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (p *Plugin) OnDisable(schoolID uuid.UUID) error { return nil }

func (p *Plugin) RegisterRoutes(r fiber.Router) {
	r.Get("/docs", p.listDocs)
	r.Get("/sync", p.syncDocs)
	r.Post("/docs", p.createDoc)
	r.Delete("/docs/:id", p.deleteDoc)
	r.Post("/query", p.queryChat) // 서버사이드 AI 쿼리 (레거시 유지)
}

// ── Handlers ──

func (p *Plugin) listDocs(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var docs []models.KnowledgeDoc
	p.db.Preload("User", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "name", "grade", "class_num")
	}).Select("id", "school_id", "title", "source_type", "original_filename", "file_url", "markdown_content", "created_by", "created_at").
		Where("school_id = ?", schoolID).
		Order("created_at DESC").
		Find(&docs)

	return c.JSON(docs)
}

// syncDocs: 문서 목록 + 내용 동기화 (교사 PC가 로컬 RAG 처리)
// markdown_content 포함 반환 → 교사 PC에서 청킹/임베딩 처리
func (p *Plugin) syncDocs(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	sinceParam := c.Query("since")

	var allIDs []string
	p.db.Model(&models.KnowledgeDoc{}).Where("school_id = ?", schoolID).Pluck("id", &allIDs)

	var updatedDocs []models.KnowledgeDoc
	query := p.db.Where("school_id = ?", schoolID)

	if sinceParam != "" {
		if sinceTime, err := time.Parse(time.RFC3339, sinceParam); err == nil {
			query = query.Where("created_at > ?", sinceTime)
		}
	}
	// markdown_content 포함 — 교사 PC에서 로컬 RAG 처리에 필요
	query.Select("id", "school_id", "title", "source_type", "original_filename", "file_url", "markdown_content", "created_by", "created_at").
		Order("created_at DESC").Find(&updatedDocs)

	return c.JSON(fiber.Map{
		"all_ids":      allIDs,
		"updated_docs": updatedDocs,
	})
}

func (p *Plugin) deleteDoc(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid ID"})
	}
	p.db.Delete(&models.KnowledgeDoc{}, "id = ?", id)
	return c.JSON(fiber.Map{"message": "deleted"})
}

func (p *Plugin) createDoc(c *fiber.Ctx) error {
	userID, _ := c.Locals("userID").(uuid.UUID)
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req DocumentRequest
	_ = c.BodyParser(&req)

	if req.Title == "" {
		req.Title = c.FormValue("title")
	}
	if req.SourceType == "" {
		req.SourceType = c.FormValue("source_type")
	}
	if req.OriginalFilename == "" {
		req.OriginalFilename = c.FormValue("original_filename")
	}
	if req.Content == "" {
		req.Content = c.FormValue("content")
	}

	if req.Content == "" {
		return c.Status(400).JSON(fiber.Map{"error": "content is empty"})
	}

	doc := models.KnowledgeDoc{
		SchoolID:         schoolID,
		Title:            req.Title,
		SourceType:       req.SourceType,
		OriginalFilename: req.OriginalFilename,
		MarkdownContent:  req.Content,
		CreatedBy:        userID,
	}

	if fileHeader, err := c.FormFile("file"); err == nil {
		uploadDir := fmt.Sprintf("./uploads/knowledge/%s", schoolID.String())
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			fmt.Println("MkdirAll error:", err)
			return c.Status(500).JSON(fiber.Map{"error": "Failed to create upload directory"})
		}
		safeName := uuid.New().String() + "-" + fileHeader.Filename
		filePath := fmt.Sprintf("%s/%s", uploadDir, safeName)
		if err := c.SaveFile(fileHeader, filePath); err != nil {
			fmt.Println("SaveFile error:", err)
			return c.Status(500).JSON(fiber.Map{"error": "Failed to save file"})
		}
		doc.FileURL = fmt.Sprintf("/uploads/knowledge/%s/%s", schoolID.String(), safeName)
	} else {
		fmt.Println("FormFile error:", err)
		// even if there's no file, we might just log it and continue
	}

	if err := p.db.Create(&doc).Error; err != nil {
		fmt.Println("DB Create error:", err)
		return c.Status(500).JSON(fiber.Map{"error": "failed to create doc"})
	}

	// 서버는 문서 저장만 담당
	// 임베딩/청킹은 교사 PC(Wails)에서 로컬 SQLite + Ollama로 처리
	return c.Status(201).JSON(doc)
}

// queryChat: 서버사이드 AI 쿼리 (레거시 — 주 검색은 교사 PC 로컬에서 처리)
func (p *Plugin) queryChat(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req QueryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	if req.Query == "" {
		return c.Status(400).JSON(fiber.Map{"error": "query is empty"})
	}

	// 서버에 저장된 문서 내용을 키워드 기반으로 컨텍스트 추출
	var docs []models.KnowledgeDoc
	p.db.Select("title", "markdown_content").Where("school_id = ?", schoolID).Find(&docs)

	keywords := strings.FieldsFunc(strings.ToLower(req.Query), func(r rune) bool {
		return r == ' ' || r == ',' || r == '?'
	})

	contextText := ""
	for _, doc := range docs {
		content := strings.ToLower(doc.MarkdownContent)
		for _, kw := range keywords {
			if len(kw) > 1 && strings.Contains(content, kw) {
				snippet := doc.MarkdownContent
				if len(snippet) > 500 {
					snippet = snippet[:500]
				}
				contextText += fmt.Sprintf("### %s\n%s\n\n", doc.Title, snippet)
				break
			}
		}
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Response().SetBodyStreamWriter(func(w *bufio.Writer) {
		ollamaReqBody, _ := json.Marshal(map[string]interface{}{
			"model": "gemma3:4b",
			"messages": []map[string]string{
				{"role": "system", "content": "당신은 학교 업무 보조 및 규정 안내를 담당하는 AI 어시스턴트입니다.\n아래 [참고 문서]에 관련 내용이 있다면 이를 최우선으로 답변하세요.\n\n[참고 문서]\n" + contextText},
				{"role": "user", "content": req.Query},
			},
			"stream": true,
		})

		resp, err := http.Post(p.ollamaURL+"/api/chat", "application/json", bytes.NewBuffer(ollamaReqBody))
		if err != nil {
			return
		}
		defer resp.Body.Close()

		reader := bufio.NewReader(resp.Body)
		for {
			line, err := reader.ReadBytes('\n')
			if err != nil {
				break
			}
			var chatResp struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
				Done bool `json:"done"`
			}
			if err := json.Unmarshal(line, &chatResp); err == nil {
				jsonEvent, _ := json.Marshal(map[string]interface{}{
					"content": chatResp.Message.Content,
					"done":    chatResp.Done,
				})
				fmt.Fprintf(w, "data: %s\n\n", jsonEvent)
				w.Flush()
			}
		}
	})

	return nil
}
