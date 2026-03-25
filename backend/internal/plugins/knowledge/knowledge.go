package knowledge

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"math"
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
	Title            string `json:"title"`
	SourceType       string `json:"source_type"` // 'file' | 'text'
	OriginalFilename string `json:"original_filename"`
	Content          string `json:"content"`
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
	db *gorm.DB
}

func New(db *gorm.DB) *Plugin {
	return &Plugin{db: db}
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
	r.Post("/query", p.queryChat)
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

func (p *Plugin) syncDocs(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)
	sinceParam := c.Query("since")

	var allIDs []string
	p.db.Model(&models.KnowledgeDoc{}).Where("school_id = ?", schoolID).Pluck("id", &allIDs) // fetch only IDs to detect deletions

	var updatedDocs []models.KnowledgeDoc
	query := p.db.Where("school_id = ?", schoolID)

	if sinceParam != "" {
		if sinceTime, err := time.Parse(time.RFC3339, sinceParam); err == nil {
			query = query.Where("created_at > ?", sinceTime)
		}
	}
	query.Order("created_at DESC").Find(&updatedDocs)

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
	if err := c.BodyParser(&req); err != nil {
		// Fallback to form-data (for file uploads)
		req.Title = c.FormValue("title")
		req.SourceType = c.FormValue("source_type")
		req.OriginalFilename = c.FormValue("original_filename")
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

	// Handle file upload
	if fileHeader, err := c.FormFile("file"); err == nil {
		uploadDir := fmt.Sprintf("./uploads/knowledge/%s", schoolID.String())
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to create upload directory"})
		}
		// ensure filename is safe or use uuid + orig ext
		safeName := uuid.New().String() + "-" + fileHeader.Filename
		filePath := fmt.Sprintf("%s/%s", uploadDir, safeName)
		if err := c.SaveFile(fileHeader, filePath); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Failed to save file"})
		}
		// Update URL
		doc.FileURL = fmt.Sprintf("/uploads/knowledge/%s/%s", schoolID.String(), safeName)
	}

	if err := p.db.Create(&doc).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to create doc"})
	}

	// 2. Chunking (naive markdown chunking by max 500 chars roughly)
	chunks := chunkText(req.Content, 500)

	// 3. Embedding and Saving
	for i, text := range chunks {
		embedding, err := getEmbedding(text)
		if err == nil && len(embedding) > 0 {
			chunk := models.KnowledgeChunk{
				DocID:      doc.ID,
				ChunkIndex: i,
				ChunkText:  text,
				Embedding:  embedding,
			}
			p.db.Create(&chunk)
		}
	}

	return c.Status(201).JSON(doc)
}

func (p *Plugin) queryChat(c *fiber.Ctx) error {
	schoolID, _ := c.Locals("schoolID").(uuid.UUID)

	var req QueryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	if req.Query == "" {
		return c.Status(400).JSON(fiber.Map{"error": "query is empty"})
	}

	// 1. Get embedding for query
	queryEmbedding, err := getEmbedding(req.Query)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to embed query"})
	}

	// 2. Fetch all chunks for the school
	var chunks []models.KnowledgeChunk
	p.db.Raw(`
		SELECT c.id, c.doc_id, c.chunk_text, c.embedding
		FROM knowledge_chunks c
		JOIN knowledge_docs d ON c.doc_id = d.id
		WHERE d.school_id = ?
	`, schoolID).Scan(&chunks)

	// 3. Find top 3 most similar chunks
	type scoredChunk struct {
		Text  string
		Score float64
	}
	var topChunks []scoredChunk

	for _, k := range chunks {
		score := cosineSimilarity(queryEmbedding, k.Embedding)
		topChunks = append(topChunks, scoredChunk{Text: k.ChunkText, Score: score})
	}

	// Sort manually (descending)
	for i := 0; i < len(topChunks)-1; i++ {
		for j := i + 1; j < len(topChunks); j++ {
			if topChunks[j].Score > topChunks[i].Score {
				topChunks[i], topChunks[j] = topChunks[j], topChunks[i]
			}
		}
	}

	contextText := ""
	for i := 0; i < len(topChunks) && i < 3; i++ {
		contextText += fmt.Sprintf("- %s\n", topChunks[i].Text)
	}

	// 4. Send to Ollama Chat (Streaming)
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Response().SetBodyStreamWriter(func(w *bufio.Writer) {
		ollamaReqBody, _ := json.Marshal(map[string]interface{}{
			"model": "gemma3:4b", // or extract the most optimal model
			"messages": []map[string]string{
				{"role": "system", "content": "당신은 학교 업무 보조 AI입니다. 다음 제공된 문서 컨텍스트를 바탕으로 질문에 정확하고 간결하게 답변하세요. 컨텍스트에 내용이 없다면 일상적인 답변을 하세요.\n\n[컨텍스트]\n" + contextText},
				{"role": "user", "content": req.Query},
			},
			"stream": true,
		})

		resp, err := http.Post("http://localhost:11434/api/chat", "application/json", bytes.NewBuffer(ollamaReqBody))
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
				// SSE format
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

// ── Helpers ──

func chunkText(text string, chunkSize int) []string {
	var chunks []string
	paragraphs := strings.Split(text, "\n\n")

	currentChunk := ""
	for _, p := range paragraphs {
		p = strings.TrimSpace(p)
		if len(p) == 0 {
			continue
		}

		if len(currentChunk)+len(p) > chunkSize && len(currentChunk) > 0 {
			chunks = append(chunks, strings.TrimSpace(currentChunk))
			currentChunk = p
		} else {
			if len(currentChunk) > 0 {
				currentChunk += "\n\n"
			}
			currentChunk += p
		}
	}
	if len(currentChunk) > 0 {
		chunks = append(chunks, strings.TrimSpace(currentChunk))
	}
	return chunks
}

func getEmbedding(text string) ([]float64, error) {
	reqBody, _ := json.Marshal(OllamaEmbedRequest{
		Model:  "nomic-embed-text",
		Prompt: text,
	})

	resp, err := http.Post("http://localhost:11434/api/embeddings", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result OllamaEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Embedding, nil
}

func cosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dotProduct, normA, normB float64
	for i := 0; i < len(a); i++ {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dotProduct / (math.Sqrt(normA) * math.Sqrt(normB))
}
