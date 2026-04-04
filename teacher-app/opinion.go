package main

import (
	"fmt"

	"github.com/google/uuid"
)

type OpinionRecord struct {
	ID        string `json:"id"`
	StudentID string `json:"student_id"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

func (a *App) SaveOpinionRecord(studentID, content string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	id := uuid.New().String()
	encContent := Encrypt(content)
	_, err := a.secureDB.Exec(`
		INSERT INTO local_opinions (id, student_id, content)
		VALUES (?, ?, ?)
		ON CONFLICT(student_id) DO UPDATE SET
			content = excluded.content,
			created_at = CURRENT_TIMESTAMP
	`, id, studentID, encContent)
	return err
}

func (a *App) GetOpinionRecords() []OpinionRecord {
	if a.secureDB == nil {
		return []OpinionRecord{}
	}
	rows, err := a.secureDB.Query("SELECT id, student_id, content, created_at FROM local_opinions")
	if err != nil {
		return []OpinionRecord{}
	}
	defer rows.Close()

	var records []OpinionRecord
	for rows.Next() {
		var r OpinionRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Content, &r.CreatedAt); err == nil {
			r.Content = Decrypt(r.Content)
			records = append(records, r)
		}
	}
	return records
}

func (a *App) SaveOpinionHistory(studentID, content string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	id := uuid.New().String()
	encContent := Encrypt(content)
	_, err := a.secureDB.Exec(`
		INSERT INTO local_opinion_histories (id, student_id, content)
		VALUES (?, ?, ?)
	`, id, studentID, encContent)
	return err
}

func (a *App) GetOpinionHistories(studentID string) []OpinionRecord {
	if a.secureDB == nil {
		return []OpinionRecord{}
	}
	rows, err := a.secureDB.Query("SELECT id, student_id, content, created_at FROM local_opinion_histories WHERE student_id = ? ORDER BY created_at DESC", studentID)
	if err != nil {
		return []OpinionRecord{}
	}
	defer rows.Close()

	var records []OpinionRecord
	for rows.Next() {
		var r OpinionRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Content, &r.CreatedAt); err == nil {
			r.Content = Decrypt(r.Content)
			records = append(records, r)
		}
	}
	return records
}

func (a *App) DeleteOpinionHistory(id string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	_, err := a.secureDB.Exec("DELETE FROM local_opinion_histories WHERE id = ?", id)
	return err
}
