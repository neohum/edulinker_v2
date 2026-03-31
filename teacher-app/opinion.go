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
	if a.attendanceDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	id := uuid.New().String()
	_, err := a.attendanceDB.Exec(`
		INSERT INTO local_opinions (id, student_id, content)
		VALUES (?, ?, ?)
		ON CONFLICT(student_id) DO UPDATE SET
			content = excluded.content,
			created_at = CURRENT_TIMESTAMP
	`, id, studentID, content)
	return err
}

func (a *App) GetOpinionRecords() []OpinionRecord {
	if a.attendanceDB == nil {
		return []OpinionRecord{}
	}
	rows, err := a.attendanceDB.Query("SELECT id, student_id, content, created_at FROM local_opinions")
	if err != nil {
		return []OpinionRecord{}
	}
	defer rows.Close()

	var records []OpinionRecord
	for rows.Next() {
		var r OpinionRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Content, &r.CreatedAt); err == nil {
			records = append(records, r)
		}
	}
	return records
}

func (a *App) SaveOpinionHistory(studentID, content string) error {
	if a.attendanceDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	id := uuid.New().String()
	_, err := a.attendanceDB.Exec(`
		INSERT INTO local_opinion_histories (id, student_id, content)
		VALUES (?, ?, ?)
	`, id, studentID, content)
	return err
}

func (a *App) GetOpinionHistories(studentID string) []OpinionRecord {
	if a.attendanceDB == nil {
		return []OpinionRecord{}
	}
	rows, err := a.attendanceDB.Query("SELECT id, student_id, content, created_at FROM local_opinion_histories WHERE student_id = ? ORDER BY created_at DESC", studentID)
	if err != nil {
		return []OpinionRecord{}
	}
	defer rows.Close()

	var records []OpinionRecord
	for rows.Next() {
		var r OpinionRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Content, &r.CreatedAt); err == nil {
			records = append(records, r)
		}
	}
	return records
}

func (a *App) DeleteOpinionHistory(id string) error {
	if a.attendanceDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	_, err := a.attendanceDB.Exec("DELETE FROM local_opinion_histories WHERE id = ?", id)
	return err
}
