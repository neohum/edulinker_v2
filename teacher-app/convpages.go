package main

import (
	"database/sql"
	"encoding/base64"
	"log"
)

// ─── Converted Page Cache (SQLite-based per-session lazy loading) ─────────────
//
// Instead of keeping 37 large data URIs in JS memory, each converted page is
// stored as a BLOB in the local DB. The frontend fetches a page only when
// it is about to become visible (IntersectionObserver), keeping memory use tiny.

func (a *App) ensureConvPagesTable() error {
	if a.secureDB == nil {
		return nil
	}
	_, err := a.secureDB.Exec(`
		CREATE TABLE IF NOT EXISTS temp_converted_pages (
			session_id TEXT NOT NULL,
			page_idx   INTEGER NOT NULL,
			image_data BLOB NOT NULL,
			PRIMARY KEY (session_id, page_idx)
		)
	`)
	return err
}

// SaveConvertedPage stores a single converted page PNG/WebP as a BLOB.
// base64Data must be a raw Base64 string (no data: prefix).
func (a *App) SaveConvertedPage(sessionId string, pageIdx int, base64Data string) error {
	if err := a.ensureConvPagesTable(); err != nil {
		return err
	}
	imgBytes, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return err
	}
	_, err = a.secureDB.Exec(
		`INSERT OR REPLACE INTO temp_converted_pages (session_id, page_idx, image_data) VALUES (?, ?, ?)`,
		sessionId, pageIdx, imgBytes,
	)
	if err != nil {
		log.Printf("[ConvPages] SaveConvertedPage error: %v", err)
	}
	return err
}

type GetConvertedPageResult struct {
	Success bool   `json:"success"`
	Base64  string `json:"base64"`  // Raw base64, no data: prefix
	Error   string `json:"error,omitempty"`
}

// GetConvertedPage fetches a single page BLOB from the local DB.
func (a *App) GetConvertedPage(sessionId string, pageIdx int) GetConvertedPageResult {
	if err := a.ensureConvPagesTable(); err != nil {
		return GetConvertedPageResult{Error: err.Error()}
	}
	var imgBytes []byte
	err := a.secureDB.QueryRow(
		`SELECT image_data FROM temp_converted_pages WHERE session_id = ? AND page_idx = ?`,
		sessionId, pageIdx,
	).Scan(&imgBytes)
	if err == sql.ErrNoRows {
		return GetConvertedPageResult{Error: "page not found"}
	}
	if err != nil {
		return GetConvertedPageResult{Error: err.Error()}
	}
	return GetConvertedPageResult{
		Success: true,
		Base64:  base64.StdEncoding.EncodeToString(imgBytes),
	}
}

// ClearConvertedPages deletes all cached pages for a given session.
// Call this when the user navigates away or starts a new document.
func (a *App) ClearConvertedPages(sessionId string) error {
	if err := a.ensureConvPagesTable(); err != nil {
		return err
	}
	_, err := a.secureDB.Exec(
		`DELETE FROM temp_converted_pages WHERE session_id = ?`, sessionId,
	)
	return err
}
