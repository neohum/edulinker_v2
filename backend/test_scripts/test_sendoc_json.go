package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/edulinker/backend/internal/database/models"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type PendingDoc struct {
	ID            uuid.UUID  `json:"id"`
	Title         string     `json:"title"`
	Status        string     `json:"status"`
	BackgroundURL string     `json:"background_url,omitempty"`
	FieldsJSON    string     `json:"fields_json,omitempty"`
	FormDataJSON  string     `json:"form_data_json,omitempty"`
	IsSigned      bool       `json:"is_signed"`
	SignedAt      *time.Time `json:"signed_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	Author        *struct {
		Name string `json:"name"`
	} `json:"author,omitempty"`
}

func main() {
	dsn := "host=localhost user=edulinker password=edulinker dbname=edulinker port=5432 sslmode=disable TimeZone=Asia/Seoul"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		panic(err)
	}

	userID := uuid.MustParse("ec449426-bd11-47dc-b1b1-b0335611e921")

	var allRecipients []models.SendocRecipient
	if err := db.Preload("User").
		Preload("Sendoc").
		Preload("Sendoc.Author").
		Where("user_id = ?", userID).
		Find(&allRecipients).Error; err != nil {
		panic(err)
	}

	var recipients []models.SendocRecipient
	for _, r := range allRecipients {
		if r.Sendoc.ID == uuid.Nil || r.Sendoc.Status == "recalled" {
			continue
		}
		recipients = append(recipients, r)
	}

	sort.Slice(recipients, func(i, j int) bool {
		return recipients[i].Sendoc.CreatedAt.After(recipients[j].Sendoc.CreatedAt)
	})

	var result []PendingDoc
	for _, r := range recipients {
		doc := PendingDoc{
			ID:            r.Sendoc.ID,
			Title:         r.Sendoc.Title,
			Status:        r.Sendoc.Status,
			BackgroundURL: r.Sendoc.BackgroundURL,
			FieldsJSON:    r.Sendoc.FieldsJSON,
			FormDataJSON:  r.FormDataJSON,
			CreatedAt:     r.Sendoc.CreatedAt,
			IsSigned:      r.IsSigned,
			SignedAt:      r.SignedAt,
		}
		if r.Sendoc.Author.Name != "" {
			doc.Author = &struct {
				Name string `json:"name"`
			}{Name: r.Sendoc.Author.Name}
		}
		result = append(result, doc)
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println("=== JSON ===")
	fmt.Println(string(out))
}
