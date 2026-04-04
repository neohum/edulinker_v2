package main

import (
	"fmt"

	"github.com/google/uuid"
)

type TodoItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Scope       string `json:"scope"`
	Priority    int    `json:"priority"`
	IsCompleted bool   `json:"is_completed"`
	DueDate     string `json:"due_date,omitempty"`
	CreatedAt   string `json:"created_at"`
}

func (a *App) GetTodos(scopeFilter, statusFilter string) []TodoItem {
	if a.secureDB == nil {
		return []TodoItem{}
	}

	rows, err := a.secureDB.Query("SELECT id, title, description, scope, priority, is_completed, IFNULL(due_date, ''), created_at FROM local_todos ORDER BY created_at DESC")
	if err != nil {
		return []TodoItem{}
	}
	defer rows.Close()

	var todos []TodoItem
	for rows.Next() {
		var t TodoItem
		var isCompInt int
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.Scope, &t.Priority, &isCompInt, &t.DueDate, &t.CreatedAt); err == nil {
			t.Title = Decrypt(t.Title)
			t.Description = Decrypt(t.Description)
			t.IsCompleted = isCompInt == 1

			// Filters
			matchScope := scopeFilter == "all" || t.Scope == scopeFilter
			matchStatus := statusFilter == "all" || (statusFilter == "completed" && t.IsCompleted) || (statusFilter == "active" && !t.IsCompleted)

			if matchScope && matchStatus {
				todos = append(todos, t)
			}
		}
	}
	return todos
}

func (a *App) SaveTodoItem(title, description, scope string, priority int) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	id := uuid.New().String()

	encTitle := Encrypt(title)
	encDesc := Encrypt(description)

	_, err := a.secureDB.Exec(`
		INSERT INTO local_todos (id, title, description, scope, priority, is_completed)
		VALUES (?, ?, ?, ?, ?, 0)
	`, id, encTitle, encDesc, scope, priority)
	return err
}

func (a *App) ToggleTodoItem(id string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}

	var isComp int
	err := a.secureDB.QueryRow("SELECT is_completed FROM local_todos WHERE id = ?", id).Scan(&isComp)
	if err != nil {
		return err
	}

	newStatus := 1
	if isComp == 1 {
		newStatus = 0
	}

	_, err = a.secureDB.Exec("UPDATE local_todos SET is_completed = ? WHERE id = ?", newStatus, id)
	return err
}

func (a *App) DeleteTodoItem(id string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not initialized")
	}
	_, err := a.secureDB.Exec("DELETE FROM local_todos WHERE id = ?", id)
	return err
}
