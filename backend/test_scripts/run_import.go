package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/edulinker/backend/internal/database/models"
	"github.com/xuri/excelize/v2"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	connStr := "user=edulinker password=edulinker dbname=edulinker sslmode=disable host=localhost port=5432"
	db, err := gorm.Open(postgres.Open(connStr), &gorm.Config{})
	if err != nil {
		log.Fatal(err)
	}

	f, err := excelize.OpenFile(`C:\Users\user\Desktop\student_template.xlsx`)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()

	sheet := f.GetSheetName(0)
	rows, err := f.GetRows(sheet)
	if err != nil {
		log.Fatal(err)
	}

	header := rows[0]
	gradeCol, classCol, numCol, nameCol, genderCol := -1, -1, -1, -1, -1

	for i, cell := range header {
		cell = strings.ReplaceAll(strings.TrimSpace(cell), " ", "")
		if cell == "학년" { gradeCol = i }
		if cell == "반" { classCol = i }
		if strings.Contains(cell, "번호") && !strings.Contains(cell, "학부모") && !strings.Contains(cell, "전화") && !strings.Contains(cell, "연락") { numCol = i }
		if strings.Contains(cell, "이름") || strings.Contains(cell, "성명") { nameCol = i }
		if strings.Contains(cell, "성별") { genderCol = i }
	}

	fmt.Printf("Columns detected: grade=%d, class=%d, num=%d, name=%d, gender=%d\n", gradeCol, classCol, numCol, nameCol, genderCol)

	for i, row := range rows[1:] {
		if len(row) <= nameCol || len(row) <= numCol { continue }

		name := strings.TrimSpace(row[nameCol])
		gender := ""
		if genderCol >= 0 && genderCol < len(row) {
			g := strings.TrimSpace(row[genderCol])
			if g == "남" || g == "남자" || g == "남성" || g == "M" || g == "m" {
				gender = "남"
			} else if g == "여" || g == "여자" || g == "여성" || g == "F" || g == "f" {
				gender = "여"
			}
		}

		var existing models.User
		err := db.Where("role = ? AND name = ?", "student", name).First(&existing).Error
		if err == nil {
			fmt.Printf("Row %d: Found '%s'. DB gender: '%s', Excel gender: '%s'. ", i+2, name, existing.Gender, gender)
			updated := false
			if gender != "" && existing.Gender != gender {
				existing.Gender = gender
				updated = true
			}
			if updated {
				db.Save(&existing)
				fmt.Printf("SAVED!\n")
			} else {
				fmt.Printf("No update needed.\n")
			}
		}
	}
}
