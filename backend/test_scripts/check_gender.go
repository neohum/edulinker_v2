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

	rows, err := db.Query("SELECT name, gender, is_active FROM users WHERE role='student' LIMIT 5")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var name, gender string
		var isActive bool
		if err := rows.Scan(&name, &gender, &isActive); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Name: %s, Gender: '%s', Active: %v\n", name, gender, isActive)
	}
}
