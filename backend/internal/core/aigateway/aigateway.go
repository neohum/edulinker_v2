package aigateway

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
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
	api.Get("/status", s.getStatus)
	api.Get("/models", s.listModels)
	api.Post("/models/pull", s.pullModel)
	api.Delete("/models/:name", s.deleteModel)
}

func (s *Service) autoCompleteDocument(c *fiber.Ctx) error {
	var req struct {
		Prompt   string `json:"prompt"`
		TaskType string `json:"task_type"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	log.Printf("[AIGW] Received autocomplete request for task: %s", req.TaskType)

	// Determine best available model
	model := s.selectBestModel(req.TaskType)

	systemPrompt := "당신은 학교 교무/행정 문서를 전문적으로 작성해주는 AI 어시스턴트입니다. 다음 주어진 키워드와 상황을 바탕으로, 격식있고 전문적인 학교 공문 또는 가정통신문 초안을 작성해주세요:\n\n"
	fullPrompt := systemPrompt + req.Prompt

	respText, err := s.callOllama(model, fullPrompt)
	if err != nil {
		log.Printf("[AIGW] Ollama execution failed with model %s: %v", model, err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error":   fmt.Sprintf("AI 서비스(%s) 응답 실패", model),
			"details": "모델이 너무 크거나 PC 리소스가 부족하여 로딩에 실패했을 수 있습니다. [설정]에서 사양에 맞는 작은 모델(2.4b 등)을 설치해보세요.",
		})
	}

	return c.JSON(fiber.Map{
		"completion": respText,
		"model":      model,
	})
}

func (s *Service) summarizeText(c *fiber.Ctx) error {
	var req struct {
		Text string `json:"text"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload"})
	}

	model := s.selectBestModel("summarize")

	systemPrompt := "다음 입력된 문서 내용을 한두 문장으로 핵심만 요약해주세요:\n\n"
	fullPrompt := systemPrompt + req.Text

	respText, err := s.callOllama(model, fullPrompt)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "AI 서비스 응답 실패 (요약)",
		})
	}

	return c.JSON(fiber.Map{
		"summary": respText,
		"model":   model,
	})
}

func (s *Service) selectBestModel(taskType string) string {
	installedModels := s.getInstalledModels()
	if len(installedModels) == 0 {
		return "gemma:2b" // absolute fallback
	}

	// Priority mapping by task type
	var priority []string
	switch taskType {
	case "student_evaluation":
		// 한국어 특화 대형 모델 우선 -> 중형 -> 소형 순
		priority = []string{"eeve", "exaone", "bllossom", "llama3", "mistral", "gemma3:12b", "gemma3:4b"}
	case "summarize":
		// 요약은 속도가 빠른 모델 우선
		priority = []string{"exaone3.5:2.4b", "gemma3:4b", "mistral", "llama3"}
	default:
		priority = []string{"exaone", "eeve", "gemma3:4b", "mistral", "llama3"}
	}

	// Pick the first available one from priority list (Prefix matching)
	for _, p := range priority {
		for _, m := range installedModels {
			if strings.HasPrefix(m, p) {
				return m
			}
		}
	}

	return installedModels[0] // fallback to first installed
}

func (s *Service) getInstalledModels() []string {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(s.ollamaURL + "/api/tags")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var data struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	json.NewDecoder(resp.Body).Decode(&data)

	var names []string
	for _, m := range data.Models {
		names = append(names, m.Name)
	}
	return names
}

func (s *Service) getStatus(c *fiber.Ctx) error {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(s.ollamaURL + "/api/tags")
	if err != nil {
		return c.JSON(fiber.Map{
			"ollama_running": false,
			"error":          "Ollama 연결 실패",
		})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data map[string]interface{}
	json.Unmarshal(body, &data)

	var modelNames []string
	if modelsRaw, ok := data["models"].([]interface{}); ok {
		for _, m := range modelsRaw {
			if model, ok := m.(map[string]interface{}); ok {
				if name, ok := model["name"].(string); ok {
					modelNames = append(modelNames, name)
				}
			}
		}
	}

	return c.JSON(fiber.Map{
		"ollama_running": true,
		"models":         modelNames,
		"ollama_url":     s.ollamaURL,
	})
}

func (s *Service) listModels(c *fiber.Ctx) error {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(s.ollamaURL + "/api/tags")
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Ollama 연결 실패"})
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var data map[string]interface{}
	json.Unmarshal(body, &data)
	return c.JSON(data)
}

func (s *Service) pullModel(c *fiber.Ctx) error {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&req); err != nil || req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "모델명 필요"})
	}

	ollamaReq := map[string]interface{}{"name": req.Name, "stream": false}
	jsonData, _ := json.Marshal(ollamaReq)

	client := &http.Client{Timeout: 60 * time.Minute}
	resp, err := client.Post(s.ollamaURL+"/api/pull", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Ollama 연결 실패"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.Status(resp.StatusCode).JSON(fiber.Map{"error": "다운로드 실패"})
	}

	return c.JSON(fiber.Map{"status": "success", "model": req.Name})
}

func (s *Service) deleteModel(c *fiber.Ctx) error {
	name := c.Params("name")
	if name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "모델명 필요"})
	}

	ollamaReq := map[string]interface{}{"name": name}
	jsonData, _ := json.Marshal(ollamaReq)

	req, _ := http.NewRequest("DELETE", s.ollamaURL+"/api/delete", bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Ollama 연결 실패"})
	}
	defer resp.Body.Close()

	return c.JSON(fiber.Map{"status": "success"})
}

func (s *Service) callOllama(model string, prompt string) (string, error) {
	ollamaReq := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"stream": false,
	}

	jsonData, err := json.Marshal(ollamaReq)
	if err != nil {
		return "", err
	}

	// 타임아웃을 5분으로 연장하여 대형 모델 로딩 대기 시간 확보
	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Post(s.ollamaURL+"/api/generate", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("Ollama 서버 통신 에러: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Ollama 에러 (Status %d): %s", resp.StatusCode, string(body))
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

	return "", fmt.Errorf("Ollama 응답 형식 오류")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
