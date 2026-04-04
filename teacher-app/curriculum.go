package main

import (
	"fmt"

	"github.com/google/uuid"
)

type EvalRecord struct {
	ID             string `json:"id"`
	StudentID      string `json:"student_id"`
	Subject        string `json:"subject"`
	EvaluationType string `json:"evaluation_type"`
	Score          int    `json:"score"`
	Feedback       string `json:"feedback"`
	CreatedAt      string `json:"created_at"`
}

func (a *App) GetCurriculumEvaluations() []EvalRecord {
	if a.secureDB == nil {
		return []EvalRecord{}
	}

	rows, err := a.secureDB.Query("SELECT id, student_id, subject, evaluation_type, score, feedback, created_at FROM local_curriculum ORDER BY created_at DESC")
	if err != nil {
		return []EvalRecord{}
	}
	defer rows.Close()

	var evaluations []EvalRecord
	for rows.Next() {
		var r EvalRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Subject, &r.EvaluationType, &r.Score, &r.Feedback, &r.CreatedAt); err == nil {
			r.EvaluationType = Decrypt(r.EvaluationType)
			r.Feedback = Decrypt(r.Feedback)
			evaluations = append(evaluations, r)
		}
	}
	return evaluations
}

func (a *App) SaveCurriculumEvaluation(studentID, subject, evaluationType string, score int, feedback string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	id := uuid.New().String()

	encEvalType := Encrypt(evaluationType)
	encFeedback := Encrypt(feedback)

	_, err := a.secureDB.Exec(`
		INSERT INTO local_curriculum (id, student_id, subject, evaluation_type, score, feedback)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, studentID, subject, encEvalType, score, encFeedback)
	return err
}

func (a *App) DeleteCurriculumEvaluation(id string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	_, err := a.secureDB.Exec("DELETE FROM local_curriculum WHERE id = ?", id)
	return err
}
