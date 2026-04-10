package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
	exePath, err := os.Executable()
	var dbPath string
	if err != nil {
		dbPath = "secure_local.db"
	} else {
		dbPath = filepath.Join(filepath.Dir(exePath), "secure_local.db")
	}

	db, err := sql.Open("sqlite", dbPath+"?_journal=WAL&_pragma=busy_timeout(5000)")
	if err != nil {
		return err
	}

	// CREATE TABLES
	_, err = db.Exec(`
		-- Announcements
		CREATE TABLE IF NOT EXISTS local_announcements (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			is_urgent BOOLEAN NOT NULL DEFAULT 0,
			target_roles TEXT DEFAULT 'ALL',
			created_at TEXT NOT NULL,
			author_id TEXT NOT NULL,
			author_name TEXT,
			is_confirmed BOOLEAN NOT NULL DEFAULT 0,
			attachments_json TEXT DEFAULT '[]'
		);

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
			grade TEXT NOT NULL DEFAULT '',
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

		-- Sendoc Drafts (임시 저장)
		CREATE TABLE IF NOT EXISTS sendoc_drafts (
			doc_id TEXT PRIMARY KEY,
			fields_json TEXT NOT NULL DEFAULT '[]',
			strokes_json TEXT NOT NULL DEFAULT '[]',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- V2 Drafts (Full Document, Local Img Links)
		CREATE TABLE IF NOT EXISTS local_sendoc_drafts_v2 (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			fields_json TEXT NOT NULL DEFAULT '[]',
			strokes_json TEXT NOT NULL DEFAULT '[]',
			image_paths_json TEXT NOT NULL DEFAULT '[]',
			target_users_json TEXT NOT NULL DEFAULT '[]',
			original_file_name TEXT NOT NULL DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- Teacher Assets (Signature, Stamp)
		CREATE TABLE IF NOT EXISTS local_teacher_assets (
			id TEXT PRIMARY KEY,
			asset_type TEXT NOT NULL,
			vector_json TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		return err
	}

	// Schema migration for existing DBs
	db.Exec("ALTER TABLE local_curriculum ADD COLUMN grade TEXT NOT NULL DEFAULT ''")

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

// --- Sendoc Draft Storage (SQLite) ---

// SaveSendocDraft saves or updates a document draft in SQLite.
func (a *App) SaveSendocDraft(docId, fieldsJSON, strokesJSON string) error {
	if a.secureDB == nil {
		return fmt.Errorf("로컬 DB가 초기화되지 않았습니다")
	}
	_, err := a.secureDB.Exec(`
		INSERT INTO sendoc_drafts (doc_id, fields_json, strokes_json, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(doc_id) DO UPDATE SET
			fields_json = excluded.fields_json,
			strokes_json = excluded.strokes_json,
			updated_at = CURRENT_TIMESTAMP
	`, docId, fieldsJSON, strokesJSON)
	return err
}

// SendocDraftResult is returned from LoadSendocDraft.
type SendocDraftResult struct {
	Found       bool   `json:"found"`
	FieldsJSON  string `json:"fields_json"`
	StrokesJSON string `json:"strokes_json"`
}

// LoadSendocDraft loads a draft from SQLite.
func (a *App) LoadSendocDraft(docId string) SendocDraftResult {
	if a.secureDB == nil {
		return SendocDraftResult{Found: false}
	}
	var fields, strokes string
	err := a.secureDB.QueryRow("SELECT fields_json, strokes_json FROM sendoc_drafts WHERE doc_id = ?", docId).Scan(&fields, &strokes)
	if err != nil {
		return SendocDraftResult{Found: false}
	}
	return SendocDraftResult{Found: true, FieldsJSON: fields, StrokesJSON: strokes}
}

// DeleteSendocDraft removes a draft from SQLite.
func (a *App) DeleteSendocDraft(docId string) error {
	if a.secureDB == nil {
		return nil
	}
	_, err := a.secureDB.Exec("DELETE FROM sendoc_drafts WHERE doc_id = ?", docId)
	return err
}

// HasSendocDraft checks if a draft exists in SQLite.
func (a *App) HasSendocDraft(docId string) bool {
	if a.secureDB == nil {
		return false
	}
	var count int
	err := a.secureDB.QueryRow("SELECT COUNT(*) FROM sendoc_drafts WHERE doc_id = ?", docId).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

// --- Teacher Assets Storage ---

// SaveTeacherAsset saves a signature or stamp vector in SQLite.
func (a *App) SaveTeacherAsset(assetType, userID, vectorJSON string) error {
	if a.secureDB == nil {
		return fmt.Errorf("로컬 DB가 초기화되지 않았습니다")
	}
	id := assetType
	if userID != "" {
		id = assetType + "_" + userID
	}
	_, err := a.secureDB.Exec(`
		INSERT INTO local_teacher_assets (id, asset_type, vector_json, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			vector_json = excluded.vector_json,
			updated_at = CURRENT_TIMESTAMP
	`, id, assetType, vectorJSON)
	return err
}

// LoadTeacherAsset loads a signature or stamp from SQLite.
func (a *App) LoadTeacherAsset(assetType, userID string) string {
	if a.secureDB == nil {
		return ""
	}
	id := assetType
	if userID != "" {
		id = assetType + "_" + userID
	}
	var vectorJSON string
	err := a.secureDB.QueryRow("SELECT vector_json FROM local_teacher_assets WHERE id = ?", id).Scan(&vectorJSON)
	if err != nil {
		return ""
	}
	return vectorJSON
}
