package main

import (
	"fmt"
	"github.com/google/uuid"
)

type AILog struct {
	ID               string `json:"id"`
	PromptType       string `json:"prompt_type"`
	InputData        string `json:"input_data"`
	GeneratedContent string `json:"generated_content"`
	CreatedAt        string `json:"created_at"`
}

func (a *App) SaveAILog(promptType, inputData, generatedContent string) error {
	if a.attendanceDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	id := uuid.New().String()
	_, err := a.attendanceDB.Exec(`
		INSERT INTO local_ai_logs (id, prompt_type, input_data, generated_content)
		VALUES (?, ?, ?, ?)
	`, id, promptType, inputData, generatedContent)
	return err
}

func (a *App) GetAILogs() []AILog {
	if a.attendanceDB == nil {
		return []AILog{}
	}
	rows, err := a.attendanceDB.Query("SELECT id, prompt_type, input_data, generated_content, created_at FROM local_ai_logs ORDER BY created_at DESC LIMIT 50")
	if err != nil {
		return []AILog{}
	}
	defer rows.Close()

	var logs []AILog
	for rows.Next() {
		var l AILog
		if err := rows.Scan(&l.ID, &l.PromptType, &l.InputData, &l.GeneratedContent, &l.CreatedAt); err == nil {
			logs = append(logs, l)
		}
	}
	return logs
}

func (a *App) DeleteAILog(id string) error {
	if a.attendanceDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	_, err := a.attendanceDB.Exec("DELETE FROM local_ai_logs WHERE id = ?", id)
	return err
}
