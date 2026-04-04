package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func hashDeterministic(data string) string {
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}

// initSecureDB initializes the local encrypted SQLite DB.
// Data is encrypted at the application level before being written to these tables.
func (a *App) initSecureDB() error {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		appData = filepath.Join(home, ".edulinker")
	}
	dbPath := filepath.Join(appData, "edulinker", "secure_local.db")

	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return err
	}
	db, err := sql.Open("sqlite", dbPath+"?_journal=WAL&_timeout=5000")
	if err != nil {
		return err
	}

	// CREATE TABLES
	_, err = db.Exec(`
		-- Attendance
		CREATE TABLE IF NOT EXISTS local_attendance (
			id TEXT PRIMARY KEY,
			student_id TEXT NOT NULL,
			date TEXT NOT NULL,
			absence_type TEXT NOT NULL,
			remark TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_student_date ON local_attendance(student_id, date);

		-- Opinions
		CREATE TABLE IF NOT EXISTS local_opinions (
			id TEXT PRIMARY KEY,
			student_id TEXT NOT NULL UNIQUE,
			content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- Opinion Histories
		CREATE TABLE IF NOT EXISTS local_opinion_histories (
			id TEXT PRIMARY KEY,
			student_id TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- AI Logs
		CREATE TABLE IF NOT EXISTS local_ai_logs (
			id TEXT PRIMARY KEY,
			prompt_type TEXT NOT NULL,
			input_data TEXT NOT NULL,
			generated_content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- Todo List
		CREATE TABLE IF NOT EXISTS local_todos (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT NOT NULL,
			scope TEXT NOT NULL,
			priority INTEGER NOT NULL DEFAULT 0,
			is_completed BOOLEAN NOT NULL DEFAULT 0,
			due_date TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- Counseling
		CREATE TABLE IF NOT EXISTS local_counseling (
			id TEXT PRIMARY KEY,
			student_id TEXT NOT NULL,
			date TEXT NOT NULL,
			type TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- Curriculum / Evaluations
		CREATE TABLE IF NOT EXISTS local_curriculum (
			id TEXT PRIMARY KEY,
			student_id TEXT NOT NULL,
			subject TEXT NOT NULL,
			evaluation_type TEXT NOT NULL,
			score INTEGER NOT NULL,
			feedback TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- Offline User Cache
		CREATE TABLE IF NOT EXISTS local_users (
			phone TEXT PRIMARY KEY,
			password TEXT NOT NULL,
			profile_json TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- Linkers (Bookmarks)
		CREATE TABLE IF NOT EXISTS local_linkers (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			url TEXT NOT NULL,
			student_url TEXT NOT NULL,
			category TEXT NOT NULL,
			is_shared BOOLEAN NOT NULL DEFAULT 0,
			share_teachers BOOLEAN NOT NULL DEFAULT 0,
			share_class BOOLEAN NOT NULL DEFAULT 0,
			target_ids TEXT NOT NULL,
			is_own BOOLEAN NOT NULL DEFAULT 0,
			sort_order INTEGER NOT NULL DEFAULT 0
		);

		-- Knowledge Base
		CREATE TABLE IF NOT EXISTS local_knowledge (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			source_type TEXT NOT NULL,
			original_filename TEXT NOT NULL,
			file_url TEXT NOT NULL,
			markdown_content TEXT NOT NULL,
			created_at TEXT NOT NULL,
			user_name TEXT NOT NULL,
			user_grade INTEGER NOT NULL DEFAULT 0,
			user_class_num INTEGER NOT NULL DEFAULT 0
		);
	`)
	if err != nil {
		return err
	}

	a.secureDB = db
	return nil
}

func (a *App) saveOfflineLogin(phone, password, profileJSON string) {
	if a.secureDB == nil {
		return
	}
	hashPhone := hashDeterministic(phone)
	hashPass := hashDeterministic(password)
	encProfile := Encrypt(profileJSON)

	a.secureDB.Exec(`
		INSERT INTO local_users (phone, password, profile_json) 
		VALUES (?, ?, ?)
		ON CONFLICT(phone) DO UPDATE SET 
			password = excluded.password,
			profile_json = excluded.profile_json,
			updated_at = CURRENT_TIMESTAMP
	`, hashPhone, hashPass, encProfile)
}

func (a *App) verifyOfflineLogin(phone, password string) LoginResult {
	if a.secureDB == nil {
		return LoginResult{Success: false, Error: "오프라인 환경이며 로컬 DB를 사용할 수 없습니다."}
	}

	hashPhone := hashDeterministic(phone)
	hashPass := hashDeterministic(password)

	var encProfile string
	err := a.secureDB.QueryRow("SELECT profile_json FROM local_users WHERE phone = ? AND password = ?", hashPhone, hashPass).Scan(&encProfile)
	if err != nil {
		return LoginResult{Success: false, Error: "오프라인 모드에서는 연결이 끊어지기 전 성공했던 계정으로만 로그인할 수 있습니다 (아이디/비밀번호 불일치)"}
	}

	decProfile := Decrypt(encProfile)

	importJson := func() LoginResult {
		var lr LoginResult
		json.Unmarshal([]byte(decProfile), &lr)
		lr.IsOffline = true

		// Ensure token starts offline so frontend APIs don't hang if they mistakenly attempt to fetch!
		// However, frontend now doesn't use token for core tabs.
		// Set our global test token anyway
		a.authToken = lr.Token
		return lr
	}

	return importJson()
}
