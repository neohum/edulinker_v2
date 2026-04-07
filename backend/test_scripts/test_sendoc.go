package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/edulinker/backend/internal/database/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	dsn := "host=localhost user=edulinker password=edulinker dbname=edulinker port=5432 sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info), // PRINT ALL SQL
	})
	if err != nil {
		log.Fatal(err)
	}

	userID := "ec449426-bd11-47dc-b1b1-b0335611e921" // from the text file

	var allRecipients []models.SendocRecipient
	if err := db.Preload("Sendoc").Where("user_id = ?", userID).Find(&allRecipients).Error; err != nil {
		log.Fatal(err)
	}

	fmt.Printf("\n--- Found %d Recipients ---\n", len(allRecipients))
	for i, r := range allRecipients {
		b, _ := json.MarshalIndent(r, "", "  ")
		fmt.Printf("Recipient[%d]:\n%s\n", i, string(b))
	}
}
