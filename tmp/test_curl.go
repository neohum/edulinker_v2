package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	// We just want to check if the backend is actually returning is_confirmed!
	resp, err := http.Get("http://localhost:5200/api/plugins/announcement")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body)[:500]) // print first 500 chars to see json keys
}
