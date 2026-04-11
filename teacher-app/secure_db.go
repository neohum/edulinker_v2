package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

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

		-- Offline Registrations Queue
		CREATE TABLE IF NOT EXISTS offline_registrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			payload_json TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- General Actions Queue
		CREATE TABLE IF NOT EXISTS local_offline_actions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			method TEXT NOT NULL,
			url TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- Local Students (Offline First Primary Store)
		CREATE TABLE IF NOT EXISTS local_students (
			id VARCHAR(255) PRIMARY KEY,
			student_number INTEGER NOT NULL,
			name VARCHAR(255) NOT NULL,
			grade INTEGER NOT NULL,
			class_num INTEGER NOT NULL,
			gender VARCHAR(10),
			parent_phone VARCHAR(50),
			parent_phone2 VARCHAR(50),
			is_active BOOLEAN DEFAULT 1,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		return err
	}

	// Schema migration for existing DBs
	db.Exec("ALTER TABLE local_curriculum ADD COLUMN grade TEXT NOT NULL DEFAULT ''")
	db.Exec("ALTER TABLE local_attendance ADD COLUMN counted_days REAL DEFAULT 1.0")
	db.Exec("ALTER TABLE local_attendance ADD COLUMN has_app BOOLEAN DEFAULT 0")
	db.Exec("ALTER TABLE local_attendance ADD COLUMN has_report BOOLEAN DEFAULT 0")
	db.Exec("ALTER TABLE local_attendance ADD COLUMN has_abs_report BOOLEAN DEFAULT 0")

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

// QueueOfflineRegistration saves registration payload to local DB for background sync.
func (a *App) QueueOfflineRegistration(req RegisterRequest) error {
	if a.secureDB == nil {
		return fmt.Errorf("로컬 DB가 초기화되지 않았습니다")
	}
	reqBytes, err := json.Marshal(req)
	if err != nil {
		return err
	}
	encPayload := Encrypt(string(reqBytes))

	_, err = a.secureDB.Exec("INSERT INTO offline_registrations (payload_json) VALUES (?)", encPayload)
	return err
}

var syncMutex sync.Mutex

// SyncOfflineData reads queued offline registrations and pushes them to the server.
func (a *App) SyncOfflineData() {
	if a.secureDB == nil || a.apiBase == "" {
		return
	}

	// Prevent concurrent execution of SyncOfflineData
	if !syncMutex.TryLock() {
		fmt.Println("[SyncOfflineData] Sync already in progress, skipping...")
		return
	}
	defer syncMutex.Unlock()

	type offlineReg struct {
		id      int
		payload string
	}
	var regs []offlineReg
	rows, err := a.secureDB.Query("SELECT id, payload_json FROM offline_registrations")
	if err == nil {
		for rows.Next() {
			var r offlineReg
			if err := rows.Scan(&r.id, &r.payload); err == nil {
				regs = append(regs, r)
			}
		}
		rows.Close()
	}

	for _, r := range regs {
		decData := Decrypt(r.payload)
		resp, err := http.Post(a.apiBase+"/api/auth/register", "application/json", strings.NewReader(decData))
		if err == nil {
			if resp.StatusCode == 201 {
				a.secureDB.Exec("DELETE FROM offline_registrations WHERE id = ?", r.id)
			} else if resp.StatusCode == 400 {
				data, _ := io.ReadAll(resp.Body)
				var errResp map[string]string
				json.Unmarshal(data, &errResp)
				if strings.Contains(errResp["error"], "already") || strings.Contains(errResp["error"], "존재") {
					a.secureDB.Exec("DELETE FROM offline_registrations WHERE id = ?", r.id)
				}
			}
			resp.Body.Close()
		}
	}

	type offlineAction struct {
		id      int
		method  string
		url     string
		payload string
	}
	var acts []offlineAction
	actRows, actErr := a.secureDB.Query("SELECT id, method, url, payload_json FROM local_offline_actions ORDER BY id ASC")
	if actErr == nil {
		for actRows.Next() {
			var r offlineAction
			if scanErr := actRows.Scan(&r.id, &r.method, &r.url, &r.payload); scanErr == nil {
				acts = append(acts, r)
			}
		}
		actRows.Close()
	}

	for _, r := range acts {
		decData := Decrypt(r.payload)
		fmt.Printf("[SyncOfflineData] Attempting sync for Action ID %d: %s %s, Payload: %s\n", r.id, r.method, a.apiBase+r.url, decData)
		req, reqErr := http.NewRequest(r.method, a.apiBase+r.url, strings.NewReader(decData))
		if reqErr == nil {
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+a.authToken)
			client := &http.Client{Timeout: 10 * time.Second}
			resp, respErr := client.Do(req)
			if respErr == nil {
				fmt.Printf("[SyncOfflineData] Action ID %d hit Server, Status: %d\n", r.id, resp.StatusCode)
				bodyBytes, _ := io.ReadAll(resp.Body)
				if resp.StatusCode >= 200 && resp.StatusCode < 300 {
					a.secureDB.Exec("DELETE FROM local_offline_actions WHERE id = ?", r.id)
					fmt.Printf("[SyncOfflineData] Action ID %d deleted from queue (Success)\n", r.id)
				} else if resp.StatusCode >= 400 && resp.StatusCode < 500 {
					// DO NOT delete if 401 Unauthorized or 403 Forbidden - these happen when the token is temporarily lost or expired (especially during hot-reload)
					if resp.StatusCode != 401 && resp.StatusCode != 403 {
						a.secureDB.Exec("DELETE FROM local_offline_actions WHERE id = ?", r.id)
						fmt.Printf("[SyncOfflineData] Action ID %d deleted from queue (Client Error): %s\n", r.id, string(bodyBytes))
					} else {
						fmt.Printf("[SyncOfflineData] Action ID %d retained in queue (Auth Error): %s\n", r.id, string(bodyBytes))
					}
				}
				resp.Body.Close()
			} else {
				fmt.Printf("[SyncOfflineData] Action ID %d HTTP Request Failed: %v\n", r.id, respErr)
			}
		}
	}
}

// QueueOfflineAction explicitly queues a generic HTTP REST action for later syncing when online
func (a *App) QueueOfflineAction(method, targetURL, payload string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local DB not initialized")
	}
	encPayload := Encrypt(payload)
	_, err := a.secureDB.Exec("INSERT INTO local_offline_actions (method, url, payload_json) VALUES (?, ?, ?)", method, targetURL, encPayload)

	// Fast-track syncing if we're currently online (reduces race condition with immediate Excel uploads)
	if err == nil {
		go func() {
			if a.apiBase != "" && a.CheckConnection() {
				a.SyncOfflineData()
			}
		}()
	}

	return err
}

// GetQueueLength returns the number of pending offline actions related to users in the queue.
func (a *App) GetQueueLength() int {
	if a.secureDB == nil {
		return 0
	}
	var count int
	a.secureDB.QueryRow("SELECT COUNT(*) FROM local_offline_actions WHERE url LIKE '%/api/core/users%'").Scan(&count)
	return count
}

// --- Local SQLite Student Management ---

// SyncLocalStudentsConfig overwrites the local students table for a given class.
func (a *App) SyncLocalStudentsConfig(grade, classNum int, studentsJSON string) error {
	if a.secureDB == nil {
		return fmt.Errorf("로컬 DB가 초기화되지 않았습니다")
	}

	// [CRITICAL FIX]: If there are any pending offline queue actions related to students/users,
	// the local SQLite is currently MORE updated than the server.
	// Overwriting it now would destroy offline creations before they sync.
	var pendingCount int
	a.secureDB.QueryRow("SELECT COUNT(*) FROM local_offline_actions WHERE url LIKE '%/api/core/users%'").Scan(&pendingCount)
	if pendingCount > 0 {
		return nil // Graceful abort: protect local integrity until queue flushes
	}

	tx, err := a.secureDB.Begin()
	if err != nil {
		return err
	}

	// Delete existing class students
	_, err = tx.Exec("DELETE FROM local_students WHERE grade = ? AND class_num = ?", grade, classNum)
	if err != nil {
		tx.Rollback()
		return err
	}

	var students []map[string]interface{}
	if err := json.Unmarshal([]byte(studentsJSON), &students); err != nil {
		tx.Rollback()
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO local_students (id, student_number, name, grade, class_num, gender, parent_phone, parent_phone2, is_active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, s := range students {
		id, _ := s["id"].(string)
		number := int(s["number"].(float64))
		name, _ := s["name"].(string)
		g := int(s["grade"].(float64))
		c := int(s["class_num"].(float64))
		gender, _ := s["gender"].(string)
		p1, _ := s["parent_phone"].(string)
		p2, _ := s["parent_phone2"].(string)
		isActive, _ := s["is_active"].(bool)

		_, err = stmt.Exec(id, number, name, g, c, gender, p1, p2, isActive)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// GetLocalStudents fetches students from local SQLite by grade and class.
func (a *App) GetLocalStudents(grade, classNum int) string {
	if a.secureDB == nil {
		return "[]"
	}

	var rows *sql.Rows
	var err error

	if grade == 0 && classNum == 0 {
		rows, err = a.secureDB.Query(`
			SELECT id, student_number, name, grade, class_num, gender, parent_phone, parent_phone2, is_active 
			FROM local_students 
			ORDER BY grade ASC, class_num ASC, student_number ASC
		`)
	} else if grade > 0 && classNum == 0 {
		rows, err = a.secureDB.Query(`
			SELECT id, student_number, name, grade, class_num, gender, parent_phone, parent_phone2, is_active 
			FROM local_students 
			WHERE grade = ?
			ORDER BY class_num ASC, student_number ASC
		`, grade)
	} else {
		rows, err = a.secureDB.Query(`
			SELECT id, student_number, name, grade, class_num, gender, parent_phone, parent_phone2, is_active 
			FROM local_students 
			WHERE grade = ? AND class_num = ? 
			ORDER BY student_number ASC
		`, grade, classNum)
	}
	if err != nil {
		return "[]"
	}
	defer rows.Close()

	var students []map[string]interface{}
	for rows.Next() {
		var id, name, gender, p1, p2 string
		var number, g, c int
		var isActive bool

		if err := rows.Scan(&id, &number, &name, &g, &c, &gender, &p1, &p2, &isActive); err == nil {
			students = append(students, map[string]interface{}{
				"id":            id,
				"number":        number,
				"name":          name,
				"grade":         g,
				"class_num":     c,
				"gender":        gender,
				"parent_phone":  p1,
				"parent_phone2": p2,
				"is_active":     isActive,
			})
		}
	}

	if len(students) == 0 {
		return "[]"
	}
	jsonData, _ := json.Marshal(students)
	return string(jsonData)
}

// InsertLocalStudent inserts a single student locally. (Called instantly offline)
func (a *App) InsertLocalStudent(studentJSON string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local DB uninitialized")
	}

	var s map[string]interface{}
	if err := json.Unmarshal([]byte(studentJSON), &s); err != nil {
		return err
	}

	id, _ := s["id"].(string)
	number := int(s["number"].(float64))
	name, _ := s["name"].(string)
	g := int(s["grade"].(float64))
	c := int(s["class_num"].(float64))
	gender, _ := s["gender"].(string)
	p1, _ := s["parent_phone"].(string)
	p2, _ := s["parent_phone2"].(string)
	isActive, _ := s["is_active"].(bool)

	_, err := a.secureDB.Exec(`
		INSERT INTO local_students (id, student_number, name, grade, class_num, gender, parent_phone, parent_phone2, is_active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, number, name, g, c, gender, p1, p2, isActive)

	if err == nil {
		// Prepare a matching POST request for remote server queue mechanism
		queuePayload := map[string]interface{}{
			"grade":         g,
			"class_num":     c,
			"number":        number,
			"name":          name,
			"gender":        gender,
			"parent_phone":  p1,
			"parent_phone2": p2,
		}
		qBytes, _ := json.Marshal(queuePayload)
		a.QueueOfflineAction("POST", "/api/core/users/add-student", string(qBytes))
	}
	return err
}

// UpdateLocalStudent updates a local student and queues it.
func (a *App) UpdateLocalStudent(studentJSON string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local DB uninitialized")
	}

	var s map[string]interface{}
	if err := json.Unmarshal([]byte(studentJSON), &s); err != nil {
		return err
	}

	id, _ := s["id"].(string)
	number := int(s["number"].(float64))
	name, _ := s["name"].(string)
	gender, _ := s["gender"].(string)
	p1, _ := s["parent_phone"].(string)
	p2, _ := s["parent_phone2"].(string)

	_, err := a.secureDB.Exec(`
		UPDATE local_students 
		SET student_number = ?, name = ?, gender = ?, parent_phone = ?, parent_phone2 = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, number, name, gender, p1, p2, id)

	if err == nil {
		// Standardize queue update using explicit backend PUT fields rules
		queuePayload := map[string]interface{}{
			"number":        number,
			"name":          name,
			"gender":        gender,
			"parent_phone":  p1,
			"parent_phone2": p2,
		}
		qBytes, _ := json.Marshal(queuePayload)
		// We use standard offline queue
		if !strings.HasPrefix(id, "local_") {
			a.QueueOfflineAction("PUT", "/api/core/users/"+id, string(qBytes))
		}
	}

	return err
}

// DeleteLocalStudentBatch deletes local rows by IDs and queues sync.
func (a *App) DeleteLocalStudentBatch(ids []string) error {
	if a.secureDB == nil || len(ids) == 0 {
		return nil
	}

	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	cleanIds := make([]string, 0)

	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
		if !strings.HasPrefix(id, "local_") {
			cleanIds = append(cleanIds, id)
		}
	}

	inClause := strings.Join(placeholders, ",")

	// Local Cascade Delete
	a.secureDB.Exec(fmt.Sprintf("DELETE FROM local_attendance WHERE student_id IN (%s)", inClause), args...)
	a.secureDB.Exec(fmt.Sprintf("DELETE FROM local_counseling WHERE student_id IN (%s)", inClause), args...)
	a.secureDB.Exec(fmt.Sprintf("DELETE FROM local_opinions WHERE student_id IN (%s)", inClause), args...)
	a.secureDB.Exec(fmt.Sprintf("DELETE FROM local_curriculum WHERE student_id IN (%s)", inClause), args...)

	query := fmt.Sprintf("DELETE FROM local_students WHERE id IN (%s)", inClause)
	_, err := a.secureDB.Exec(query, args...)

	if err == nil && len(cleanIds) > 0 {
		payload := map[string]interface{}{"ids": cleanIds}
		qBytes, _ := json.Marshal(payload)
		a.QueueOfflineAction("POST", "/api/core/users/delete-students-batch", string(qBytes))
	}
	return err
}

// ClearLocalClass removes an entire class locally with cascade, and queues sync.
func (a *App) ClearLocalClass(grade, classNum int) error {
	if a.secureDB == nil {
		return nil
	}

	// First find student IDs to cascade delete
	rows, err := a.secureDB.Query("SELECT id FROM local_students WHERE grade = ? AND class_num = ?", grade, classNum)
	if err == nil {
		var ids []interface{}
		var placeholders []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err == nil {
				ids = append(ids, id)
				placeholders = append(placeholders, "?")
			}
		}
		rows.Close()

		if len(ids) > 0 {
			inClause := strings.Join(placeholders, ",")
			a.secureDB.Exec(fmt.Sprintf("DELETE FROM local_attendance WHERE student_id IN (%s)", inClause), ids...)
			a.secureDB.Exec(fmt.Sprintf("DELETE FROM local_counseling WHERE student_id IN (%s)", inClause), ids...)
			a.secureDB.Exec(fmt.Sprintf("DELETE FROM local_opinions WHERE student_id IN (%s)", inClause), ids...)
			a.secureDB.Exec(fmt.Sprintf("DELETE FROM local_curriculum WHERE student_id IN (%s)", inClause), ids...)
		}
	}

	_, err = a.secureDB.Exec("DELETE FROM local_students WHERE grade = ? AND class_num = ?", grade, classNum)
	if err == nil {
		a.QueueOfflineAction("DELETE", fmt.Sprintf("/api/core/users/students-by-class?grade=%d&class_num=%d", grade, classNum), "")
	}
	return err
}
