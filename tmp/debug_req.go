package main

import (
	"fmt"

	_ "modernc.org/sqlite"
)

func main() {
	// Open the server database to see if reading records are inserted!
	dbPath := "e:\\works\\project\\edulinker\\server-dashboard\\server_local.db"
	// Wait, the backend uses PostgreSQL usually. But let's check .env
	fmt.Println("Check the DB...")
}
