package main

import (
	"fmt"

	"github.com/google/uuid"
)

type CounselingRecord struct {
	ID        string `json:"id"`
	StudentID string `json:"student_id"`
	Date      string `json:"date"`
	Type      string `json:"type"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

func (a *App) GetCounselingRecords(studentID string) []CounselingRecord {
	if a.secureDB == nil {
		return []CounselingRecord{}
	}

	rows, err := a.secureDB.Query("SELECT id, student_id, date, type, content, created_at FROM local_counseling WHERE student_id = ? ORDER BY date DESC, created_at DESC", studentID)
	if err != nil {
		return []CounselingRecord{}
	}
	defer rows.Close()

	var records []CounselingRecord
	for rows.Next() {
		var r CounselingRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Date, &r.Type, &r.Content, &r.CreatedAt); err == nil {
			r.Content = Decrypt(r.Content)
			records = append(records, r)
		}
	}
	return records
}

func (a *App) SaveCounselingRecord(studentID, dateStr, cType, content string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	id := uuid.New().String()

	encContent := Encrypt(content)

	_, err := a.secureDB.Exec(`
		INSERT INTO local_counseling (id, student_id, date, type, content)
		VALUES (?, ?, ?, ?, ?)
	`, id, studentID, dateStr, cType, encContent)
	return err
}

func (a *App) DeleteCounselingRecord(id string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	_, err := a.secureDB.Exec("DELETE FROM local_counseling WHERE id = ?", id)
	return err
}
