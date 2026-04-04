package main

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type AnnouncementRead struct {
	AnnouncementID string `gorm:"column:announcement_id"`
	UserID         string `gorm:"column:user_id"`
	IsConfirmed    bool   `gorm:"column:is_confirmed"`
}

func (AnnouncementRead) TableName() string {
	return "announcement_reads"
}

func main() {
	godotenv.Load("e:\\works\\project\\edulinker\\backend\\.env")
	// wait edulinker uses postgres
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Seoul",
		os.Getenv("DB_HOST"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"), os.Getenv("DB_PORT"))
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		fmt.Println("DB Open Error:", err)
		return
	}

	var reads []AnnouncementRead
	db.Find(&reads)
	for _, r := range reads {
		fmt.Printf("Doc: %s, User: %s, Confirmed: %v\n", r.AnnouncementID, r.UserID, r.IsConfirmed)
	}
}
