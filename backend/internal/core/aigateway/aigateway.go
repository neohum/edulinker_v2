package aigateway

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/edulinker/backend/internal/core/middleware"
	"github.com/edulinker/backend/internal/database/models"
	"github.com/gofiber/fiber/v2"
)

// Service provides a proxy to the local Ollama instance (Phase 3).
type Service struct {
	ollamaURL string
}

func NewService(ollamaURL string) *Service {
	return &Service{
		ollamaURL: ollamaURL,
	}
}

func (s *Service) RegisterRoutes(router fiber.Router) {
	// Only accessible to Teachers and Admins (for document auto-completion)
	api := router.Group("/ai", middleware.RoleMiddleware(models.RoleTeacher, models.RoleAdmin))

	api.Post("/autocomplete", s.autoCompleteDocument)
	api.Post("/summarize", s.summarizeText)
}

func (s *Service) autoCompleteDocument(c *fiber.Ctx) error {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	log.Printf("[AIGW] Received autocomplete request for prompt: %s", req.Prompt[:min(50, len(req.Prompt))])

	systemPrompt := "당신은 학교 교무/행정 문서를 전문적으로 작성해주는 AI 어시스턴트입니다. 다음 주어진 키워드와 상황을 바탕으로, 격식있고 전문적인 학교 공문 또는 가정통신문 초안을 작성해주세요:\n\n"
	fullPrompt := systemPrompt + req.Prompt

	respText, err := s.callOllama(fullPrompt)
	if err != nil {
		log.Printf("[AIGW] Ollama execution failed: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error":   "AI 서비스에 접근할 수 없습니다. (Ollama 구동 확인 필요)",
			"details": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"completion": respText,
		"model":      "ollama/gemma",
	})
}

func (s *Service) summarizeText(c *fiber.Ctx) error {
	var req struct {
		Text string `json:"text"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	systemPrompt := "다음 입력된 문서 내용을 한두 문장으로 핵심만 요약해주세요:\n\n"
	fullPrompt := systemPrompt + req.Text

	respText, err := s.callOllama(fullPrompt)
	if err != nil {
		log.Printf("[AIGW] Ollama execution failed: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "AI 서비스에 접근할 수 없습니다.",
		})
	}

	return c.JSON(fiber.Map{
		"summary": respText,
		"model":   "ollama/gemma",
	})
}

func (s *Service) callOllama(prompt string) (string, error) {
	ollamaReq := map[string]interface{}{
		"model":  "gemma", // Targeting the 2B or 4B standard tag
		"prompt": prompt,
		"stream": false,
	}

	jsonData, err := json.Marshal(ollamaReq)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Post(s.ollamaURL+"/api/generate", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("connection error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ollama returned status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var ollamaResp map[string]interface{}
	if err := json.Unmarshal(body, &ollamaResp); err != nil {
		return "", err
	}

	if responseStr, ok := ollamaResp["response"].(string); ok {
		return responseStr, nil
	}

	return "", fmt.Errorf("invalid response format from ollama")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
