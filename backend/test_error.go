package main

import (
	"fmt"
	"log"

	"github.com/edulinker/backend/internal/config"
	"github.com/edulinker/backend/internal/database"
	"github.com/edulinker/backend/internal/database/models"
)

func main() {
	cfg := config.Load()
	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Fatal(err)
	}

	school := models.School{
		Name: "TEST S",
		Code: "TS01",
	}
	if err := db.Where("code = ?", school.Code).FirstOrCreate(&school).Error; err != nil {
		fmt.Println("SCHOOL ERROR:", err)
	}

	user := models.User{
		SchoolID: school.ID,
		Name:     "Test Teacher",
		Phone:    "010-9999-8888",
		Role:     models.RoleTeacher,
		IsActive: true,
	}

	// First make sure previous test user is deleted
	db.Where("phone = ?", "010-9999-8888").Delete(&models.User{})

	err = db.Create(&user).Error
	fmt.Printf("==> DB ERROR: %v\n", err)
}
