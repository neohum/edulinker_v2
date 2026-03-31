package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type AttendanceRecord struct {
	ID        string `json:"id"`
	StudentID string `json:"student_id"`
	Date      string `json:"date"`
	Type      string `json:"absence_type"`
	Remark    string `json:"remark"`
	CreatedAt string `json:"created_at"`
}

func (a *App) initLocalAttendance() error {
	dbPath, err := localAttendanceDBPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return err
	}
	db, err := sql.Open("sqlite", dbPath+"?_journal=WAL&_timeout=5000")
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS local_attendance (
			id TEXT PRIMARY KEY,
			student_id TEXT NOT NULL,
			date TEXT NOT NULL,
			absence_type TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_student_date ON local_attendance(student_id, date);

		CREATE TABLE IF NOT EXISTS local_opinions (
			id TEXT PRIMARY KEY,
			student_id TEXT NOT NULL UNIQUE,
			content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS local_opinion_histories (
			id TEXT PRIMARY KEY,
			student_id TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS local_ai_logs (
			id TEXT PRIMARY KEY,
			prompt_type TEXT NOT NULL,
			input_data TEXT NOT NULL,
			generated_content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		return err
	}

	// Add remark column if it doesn't exist
	db.Exec(`ALTER TABLE local_attendance ADD COLUMN remark TEXT DEFAULT ''`)

	a.attendanceDB = db
	return nil
}

func localAttendanceDBPath() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		appData = filepath.Join(home, ".edulinker")
	}
	// teacher-app attendance DB
	return filepath.Join(appData, "edulinker", "attendance.db"), nil
}

func (a *App) SaveAttendanceRecord(studentID, dateStr, absenceType string) error {
	if a.attendanceDB == nil {
		return fmt.Errorf("local attendance db not initialized")
	}
	id := uuid.New().String()
	
	remark := ""
	if absenceType == "교외체험학습" {
		remark = "교외체험학습"
	}

	_, err := a.attendanceDB.Exec(`
		INSERT INTO local_attendance (id, student_id, date, absence_type, remark)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(student_id, date) DO UPDATE SET
			remark = CASE WHEN local_attendance.absence_type != excluded.absence_type THEN excluded.remark ELSE local_attendance.remark END,
			absence_type = excluded.absence_type,
			created_at = CURRENT_TIMESTAMP
	`, id, studentID, dateStr, absenceType, remark)
	return err
}

func (a *App) GetMonthAttendanceRecords(ym string) []AttendanceRecord {
	if a.attendanceDB == nil {
		return []AttendanceRecord{}
	}
	// "2026-03" -> search records that start with this year-month
	rows, err := a.attendanceDB.Query("SELECT id, student_id, date, absence_type, IFNULL(remark, ''), created_at FROM local_attendance WHERE date LIKE ?", ym+"-%")
	if err != nil {
		return []AttendanceRecord{}
	}
	defer rows.Close()

	var records []AttendanceRecord
	for rows.Next() {
		var r AttendanceRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Date, &r.Type, &r.Remark, &r.CreatedAt); err == nil {
			records = append(records, r)
		}
	}
	return records
}

func (a *App) GetSchoolYearRecords(year int) []AttendanceRecord {
	if a.attendanceDB == nil {
		return []AttendanceRecord{}
	}
	startStr := fmt.Sprintf("%04d-03-01", year)
	endStr := fmt.Sprintf("%04d-02-29", year+1)
	
	rows, err := a.attendanceDB.Query("SELECT id, student_id, date, absence_type, IFNULL(remark, ''), created_at FROM local_attendance WHERE date >= ? AND date <= ?", startStr, endStr)
	if err != nil {
		return []AttendanceRecord{}
	}
	defer rows.Close()

	var records []AttendanceRecord
	for rows.Next() {
		var r AttendanceRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Date, &r.Type, &r.Remark, &r.CreatedAt); err == nil {
			records = append(records, r)
		}
	}
	return records
}

func (a *App) DeleteAttendanceRecord(id string) error {
	if a.attendanceDB == nil {
		return fmt.Errorf("local attendance db not initialized")
	}
	_, err := a.attendanceDB.Exec("DELETE FROM local_attendance WHERE id = ?", id)
	return err
}

func (a *App) SaveAttendanceRemarks(ids []string, remark string) error {
	if a.attendanceDB == nil {
		return fmt.Errorf("local attendance db not initialized")
	}
	if len(ids) == 0 {
		return nil
	}
	
	tx, err := a.attendanceDB.Begin()
	if err != nil {
		return err
	}
	
	stmt, err := tx.Prepare("UPDATE local_attendance SET remark = ? WHERE id = ?")
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()
	
	for _, id := range ids {
		if _, err := stmt.Exec(remark, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	
	return tx.Commit()
}
