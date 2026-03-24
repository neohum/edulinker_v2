package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	"github.com/edulinker/backend/internal/config"
	"github.com/edulinker/backend/internal/database"
	"github.com/edulinker/backend/internal/database/migrator"
)

func usage() {
	fmt.Println("Usage: go run cmd/migrate/main.go <command> [args]")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  up       Apply all pending migrations")
	fmt.Println("  down     Rollback the last applied migration")
	fmt.Println("  status   Show status of all migrations")
	fmt.Println("  create   Create a new migration (requires a name argument)")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  go run cmd/migrate/main.go up")
	fmt.Println("  go run cmd/migrate/main.go down")
	fmt.Println("  go run cmd/migrate/main.go status")
	fmt.Println("  go run cmd/migrate/main.go create add_courses_table")
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	command := os.Args[1]

	// Load application config (reads .env / environment variables).
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	// Connect to the database.
	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	// Resolve migrations directory relative to this source file so it works
	// both when running via `go run` from the repo root and from other dirs.
	migrationsDir := resolveMigrationsDir()

	m := migrator.New(db, migrationsDir)

	switch command {
	case "up":
		if err := m.Up(); err != nil {
			log.Fatalf("migration up failed: %v", err)
		}
	case "down":
		if err := m.Down(); err != nil {
			log.Fatalf("migration down failed: %v", err)
		}
	case "status":
		if err := m.Status(); err != nil {
			log.Fatalf("migration status failed: %v", err)
		}
	case "create":
		if len(os.Args) < 3 {
			fmt.Println("Error: create requires a migration name")
			fmt.Println("  go run cmd/migrate/main.go create <name>")
			os.Exit(1)
		}
		name := os.Args[2]
		if err := m.CreateMigration(name); err != nil {
			log.Fatalf("create migration failed: %v", err)
		}
	default:
		fmt.Printf("Unknown command: %s\n\n", command)
		usage()
		os.Exit(1)
	}
}

// resolveMigrationsDir finds the migrations/ directory.
// It first checks relative to the working directory (repo root convention),
// then falls back to the source-file location for `go run`.
func resolveMigrationsDir() string {
	// Try working directory first (expected: running from backend/).
	candidates := []string{
		"migrations",
	}

	// Also try relative to source file (for `go run` from anywhere).
	_, thisFile, _, ok := runtime.Caller(0)
	if ok {
		// thisFile = .../cmd/migrate/main.go  ->  go up 2 levels to backend/
		backendDir := filepath.Dir(filepath.Dir(filepath.Dir(thisFile)))
		candidates = append(candidates, filepath.Join(backendDir, "migrations"))
	}

	for _, dir := range candidates {
		abs, _ := filepath.Abs(dir)
		if info, err := os.Stat(abs); err == nil && info.IsDir() {
			return abs
		}
	}

	// Fallback: just use "migrations" and let the migrator report the error.
	abs, _ := filepath.Abs("migrations")
	return abs
}
