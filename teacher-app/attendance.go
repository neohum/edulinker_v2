package main

import (
	"fmt"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type AttendanceRecord struct {
	ID           string  `json:"id"`
	StudentID    string  `json:"student_id"`
	Date         string  `json:"date"`
	Type         string  `json:"absence_type"`
	Remark       string  `json:"remark"`
	CountedDays  float64 `json:"counted_days"`
	HasApp       bool    `json:"has_app"`
	HasReport    bool    `json:"has_report"`
	HasAbsReport bool    `json:"has_abs_report"`
	CreatedAt    string  `json:"created_at"`
}

// Removed localAttendanceDBPath definition since secure_db.go handles init

func (a *App) SaveAttendanceRecord(studentID, dateStr, absenceType string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local attendance db not initialized")
	}
	id := uuid.New().String()

	remark := ""
	if absenceType == "교외체험학습" {
		remark = "교외체험학습"
	}

	encDate := Encrypt(dateStr)
	encType := Encrypt(absenceType)
	encRemark := Encrypt(remark)

	_, err := a.secureDB.Exec(`
		INSERT INTO local_attendance (id, student_id, date, absence_type, remark, counted_days, has_app, has_report, has_abs_report)
		VALUES (?, ?, ?, ?, ?, 1.0, 0, 0, 0)
		ON CONFLICT(student_id, date) DO UPDATE SET
			remark = CASE WHEN local_attendance.absence_type != excluded.absence_type THEN excluded.remark ELSE local_attendance.remark END,
			absence_type = excluded.absence_type,
			counted_days = 1.0,
			created_at = CURRENT_TIMESTAMP
	`, id, studentID, encDate, encType, encRemark)

	if err != nil {
		fmt.Println("SaveAttendanceRecord Exec error:", err)
	}
	return err
}

func (a *App) GetMonthAttendanceRecords(ym string) []AttendanceRecord {
	if a.secureDB == nil {
		return []AttendanceRecord{}
	}
	// We read ALL records and decrypt to filter by ym because SQLite `LIKE` won't work on AES ciphertext!
	rows, err := a.secureDB.Query("SELECT id, student_id, date, absence_type, IFNULL(remark, ''), IFNULL(counted_days, 1.0), IFNULL(has_app, 0), IFNULL(has_report, 0), IFNULL(has_abs_report, 0), created_at FROM local_attendance")
	if err != nil {
		return []AttendanceRecord{}
	}
	defer rows.Close()

	var records []AttendanceRecord
	for rows.Next() {
		var r AttendanceRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Date, &r.Type, &r.Remark, &r.CountedDays, &r.HasApp, &r.HasReport, &r.HasAbsReport, &r.CreatedAt); err == nil {
			r.Date = Decrypt(r.Date)
			r.Type = Decrypt(r.Type)
			r.Remark = Decrypt(r.Remark)

			// Custom filtering since dates are encrypted in DB
			if len(r.Date) >= len(ym) && r.Date[:len(ym)] == ym {
				records = append(records, r)
			}
		}
	}
	return records
}

func (a *App) GetSchoolYearRecords(year int) []AttendanceRecord {
	if a.secureDB == nil {
		return []AttendanceRecord{}
	}
	startStr := fmt.Sprintf("%04d-03-01", year)
	endStr := fmt.Sprintf("%04d-02-29", year+1)

	// Read all, decrypt, then filter
	rows, err := a.secureDB.Query("SELECT id, student_id, date, absence_type, IFNULL(remark, ''), IFNULL(counted_days, 1.0), IFNULL(has_app, 0), IFNULL(has_report, 0), IFNULL(has_abs_report, 0), created_at FROM local_attendance")
	if err != nil {
		return []AttendanceRecord{}
	}
	defer rows.Close()

	var records []AttendanceRecord
	for rows.Next() {
		var r AttendanceRecord
		if err := rows.Scan(&r.ID, &r.StudentID, &r.Date, &r.Type, &r.Remark, &r.CountedDays, &r.HasApp, &r.HasReport, &r.HasAbsReport, &r.CreatedAt); err == nil {
			r.Date = Decrypt(r.Date)
			r.Type = Decrypt(r.Type)
			r.Remark = Decrypt(r.Remark)

			if r.Date >= startStr && r.Date <= endStr {
				records = append(records, r)
			}
		}
	}
	return records
}

func (a *App) DeleteAttendanceRecord(id string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local attendance db not initialized")
	}
	_, err := a.secureDB.Exec("DELETE FROM local_attendance WHERE id = ?", id)
	return err
}

func (a *App) SaveAttendanceRemarks(ids []string, remark string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local attendance db not initialized")
	}
	if len(ids) == 0 {
		return nil
	}

	tx, err := a.secureDB.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare("UPDATE local_attendance SET remark = ? WHERE id = ?")
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	encRemark := Encrypt(remark)

	for _, id := range ids {
		if _, err := stmt.Exec(encRemark, id); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func (a *App) SaveAttendanceDays(ids []string, totalDays float64) error {
	if a.secureDB == nil {
		return fmt.Errorf("local attendance db not initialized")
	}
	if len(ids) == 0 {
		return nil
	}

	perRow := totalDays / float64(len(ids))

	tx, err := a.secureDB.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare("UPDATE local_attendance SET counted_days = ? WHERE id = ?")
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, id := range ids {
		if _, err := stmt.Exec(perRow, id); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func (a *App) SaveAttendanceDocs(ids []string, docType string, status bool) error {
	if a.secureDB == nil {
		return fmt.Errorf("local attendance db not initialized")
	}
	if len(ids) == 0 {
		return nil
	}

	tx, err := a.secureDB.Begin()
	if err != nil {
		return err
	}

	colName := ""
	if docType == "app" {
		colName = "has_app"
	} else if docType == "report" {
		colName = "has_report"
	} else if docType == "abs_report" {
		colName = "has_abs_report"
	} else {
		tx.Rollback()
		return fmt.Errorf("invalid doc type")
	}

	query := fmt.Sprintf("UPDATE local_attendance SET %s = ? WHERE id = ?", colName)
	stmt, err := tx.Prepare(query)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	val := 0
	if status {
		val = 1
	}

	for _, id := range ids {
		if _, err := stmt.Exec(val, id); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}
