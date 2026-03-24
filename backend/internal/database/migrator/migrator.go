package migrator

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

// SchemaMigration tracks which migrations have been applied.
type SchemaMigration struct {
	Version   string    `gorm:"type:varchar(15);primaryKey"`
	Name      string    `gorm:"type:varchar(255);not null"`
	AppliedAt time.Time `gorm:"autoCreateTime"`
}

// Migrator manages database schema migrations via .sql files.
type Migrator struct {
	db            *gorm.DB
	migrationsDir string
}

// New creates a Migrator that reads .sql files from the given directory.
// It ensures the schema_migrations tracking table exists.
func New(db *gorm.DB, migrationsDir string) *Migrator {
	m := &Migrator{db: db, migrationsDir: migrationsDir}
	m.ensureTable()
	return m
}

// ensureTable creates the schema_migrations table if it does not exist.
func (m *Migrator) ensureTable() {
	m.db.AutoMigrate(&SchemaMigration{})
}

// migration represents a single migration discovered on disk.
type migration struct {
	Version  string // YYYYMMDD_HHMMSS
	Name     string // human-readable description
	UpFile   string // absolute path to .up.sql
	DownFile string // absolute path to .down.sql
}

// discoverMigrations scans the migrations directory for .up.sql files and
// pairs them with their .down.sql counterparts.
func (m *Migrator) discoverMigrations() ([]migration, error) {
	entries, err := os.ReadDir(m.migrationsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read migrations directory %s: %w", m.migrationsDir, err)
	}

	migMap := make(map[string]*migration)

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()

		var version, desc, direction string
		if strings.HasSuffix(name, ".up.sql") {
			direction = "up"
			base := strings.TrimSuffix(name, ".up.sql")
			version, desc = parseFilename(base)
		} else if strings.HasSuffix(name, ".down.sql") {
			direction = "down"
			base := strings.TrimSuffix(name, ".down.sql")
			version, desc = parseFilename(base)
		} else {
			continue
		}

		if version == "" {
			continue
		}

		mg, ok := migMap[version]
		if !ok {
			mg = &migration{Version: version, Name: desc}
			migMap[version] = mg
		}

		absPath := filepath.Join(m.migrationsDir, name)
		switch direction {
		case "up":
			mg.UpFile = absPath
		case "down":
			mg.DownFile = absPath
		}
	}

	// Collect and sort by version (lexicographic sort works for YYYYMMDD_HHMMSS).
	var migs []migration
	for _, mg := range migMap {
		if mg.UpFile == "" {
			continue // skip migrations without an up file
		}
		migs = append(migs, *mg)
	}
	sort.Slice(migs, func(i, j int) bool {
		return migs[i].Version < migs[j].Version
	})

	return migs, nil
}

// parseFilename extracts the version timestamp and description from a migration
// filename base (without the .up.sql / .down.sql suffix).
// Expected format: YYYYMMDD_HHMMSS_description
func parseFilename(base string) (version, description string) {
	// Version is the first 15 characters: YYYYMMDD_HHMMSS
	if len(base) < 15 {
		return "", ""
	}
	version = base[:15]
	if len(base) > 16 {
		description = base[16:] // skip the underscore separator
	}
	return version, description
}

// appliedVersions returns the set of already-applied migration versions.
func (m *Migrator) appliedVersions() (map[string]bool, error) {
	var rows []SchemaMigration
	if err := m.db.Order("version").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to query schema_migrations: %w", err)
	}
	applied := make(map[string]bool, len(rows))
	for _, r := range rows {
		applied[r.Version] = true
	}
	return applied, nil
}

// Up applies all pending migrations in order.
func (m *Migrator) Up() error {
	migs, err := m.discoverMigrations()
	if err != nil {
		return err
	}

	applied, err := m.appliedVersions()
	if err != nil {
		return err
	}

	pending := 0
	for _, mg := range migs {
		if applied[mg.Version] {
			continue
		}
		pending++

		log.Printf("[migrate] applying %s_%s ...", mg.Version, mg.Name)

		sql, err := os.ReadFile(mg.UpFile)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", mg.UpFile, err)
		}

		if err := m.execSQL(string(sql)); err != nil {
			return fmt.Errorf("migration %s failed: %w", mg.Version, err)
		}

		record := SchemaMigration{
			Version: mg.Version,
			Name:    mg.Name,
		}
		if err := m.db.Create(&record).Error; err != nil {
			return fmt.Errorf("failed to record migration %s: %w", mg.Version, err)
		}

		log.Printf("[migrate] applied  %s_%s", mg.Version, mg.Name)
	}

	if pending == 0 {
		log.Println("[migrate] no pending migrations")
	} else {
		log.Printf("[migrate] applied %d migration(s)", pending)
	}
	return nil
}

// Down rolls back the most recently applied migration.
func (m *Migrator) Down() error {
	// Find the last applied migration.
	var last SchemaMigration
	if err := m.db.Order("version DESC").First(&last).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Println("[migrate] nothing to rollback")
			return nil
		}
		return fmt.Errorf("failed to find last migration: %w", err)
	}

	migs, err := m.discoverMigrations()
	if err != nil {
		return err
	}

	// Find matching migration on disk.
	var target *migration
	for i := range migs {
		if migs[i].Version == last.Version {
			target = &migs[i]
			break
		}
	}
	if target == nil {
		return fmt.Errorf("migration %s not found on disk", last.Version)
	}
	if target.DownFile == "" {
		return fmt.Errorf("no down migration file for %s", last.Version)
	}

	log.Printf("[migrate] rolling back %s_%s ...", target.Version, target.Name)

	sql, err := os.ReadFile(target.DownFile)
	if err != nil {
		return fmt.Errorf("failed to read %s: %w", target.DownFile, err)
	}

	if err := m.execSQL(string(sql)); err != nil {
		return fmt.Errorf("rollback %s failed: %w", target.Version, err)
	}

	if err := m.db.Where("version = ?", target.Version).Delete(&SchemaMigration{}).Error; err != nil {
		return fmt.Errorf("failed to remove migration record %s: %w", target.Version, err)
	}

	log.Printf("[migrate] rolled back %s_%s", target.Version, target.Name)
	return nil
}

// Status prints the status of every known migration.
func (m *Migrator) Status() error {
	migs, err := m.discoverMigrations()
	if err != nil {
		return err
	}

	applied, err := m.appliedVersions()
	if err != nil {
		return err
	}

	fmt.Printf("%-17s %-40s %s\n", "VERSION", "NAME", "STATUS")
	fmt.Println(strings.Repeat("-", 70))

	for _, mg := range migs {
		status := "pending"
		if applied[mg.Version] {
			status = "applied"
		}
		fmt.Printf("%-17s %-40s %s\n", mg.Version, mg.Name, status)
	}
	return nil
}

// CreateMigration generates a new pair of empty .up.sql and .down.sql files.
func (m *Migrator) CreateMigration(name string) error {
	version := time.Now().Format("20060102_150405")
	baseName := fmt.Sprintf("%s_%s", version, name)

	upPath := filepath.Join(m.migrationsDir, baseName+".up.sql")
	downPath := filepath.Join(m.migrationsDir, baseName+".down.sql")

	header := fmt.Sprintf("-- Migration: %s\n-- Created at: %s\n\n", name, time.Now().Format(time.RFC3339))

	if err := os.WriteFile(upPath, []byte(header), 0644); err != nil {
		return fmt.Errorf("failed to create %s: %w", upPath, err)
	}
	if err := os.WriteFile(downPath, []byte(header), 0644); err != nil {
		return fmt.Errorf("failed to create %s: %w", downPath, err)
	}

	log.Printf("[migrate] created %s", upPath)
	log.Printf("[migrate] created %s", downPath)
	return nil
}

// execSQL executes raw SQL, splitting on semicolons to handle multi-statement files.
func (m *Migrator) execSQL(rawSQL string) error {
	// Execute the entire file as a single exec; PostgreSQL handles multi-statement.
	return m.db.Exec(rawSQL).Error
}
