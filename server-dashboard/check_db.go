//go:build ignore

package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

func main() {
	connStr := "user=edulinker password=edulinker dbname=edulinker sslmode=disable host=localhost port=5432"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT id, source_type, title, file_url
		FROM knowledge_docs
	`)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, title string
		var sourceType, fileUrl sql.NullString
		if err := rows.Scan(&id, &sourceType, &title, &fileUrl); err != nil {
			fmt.Println("Scan err:", err)
			continue
		}
		fmt.Printf("ID: %s, SourceType: '%s', Title: '%s', FileURL: '%s'\n", id, sourceType.String, title, fileUrl.String)
	}
}
