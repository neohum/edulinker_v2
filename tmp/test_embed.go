package main

import (
	"encoding/json"
	"fmt"
)

type Content struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type DTO struct {
	Content
	IsConfirmed bool `json:"is_confirmed"`
}

func main() {
	d := DTO{
		Content:     Content{ID: "123", Title: "test"},
		IsConfirmed: true,
	}
	b, _ := json.Marshal(d)
	fmt.Println(string(b))
}
