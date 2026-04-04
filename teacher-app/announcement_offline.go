package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
)

type LocalAnnouncement struct {
	ID              string `json:"id"`
	Type            string `json:"type"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	IsUrgent        bool   `json:"is_urgent"`
	TargetRoles     string `json:"target_roles"`
	CreatedAt       string `json:"created_at"`
	AuthorID        string `json:"author_id"`
	IsConfirmed     bool   `json:"is_confirmed"`
	AttachmentsJSON string `json:"attachments_json"`
	Author          *struct {
		Name string `json:"name"`
		ID   string `json:"id"`
	} `json:"author,omitempty"`
}

type LocalAnnouncementFile struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Size int64  `json:"size"`
}

func (a *App) getAnnouncementDir() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, ".edulinker")
	}
	dir := filepath.Join(appData, "edulinker", "announcement_files")
	os.MkdirAll(dir, 0755)
	return dir
}

func (a *App) SyncAnnouncements(docsJSON, apiBase string, token string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not init")
	}
	var docs []LocalAnnouncement
	if err := json.Unmarshal([]byte(docsJSON), &docs); err != nil {
		return err
	}

	tx, err := a.secureDB.Begin()
	if err != nil {
		return err
	}
	tx.Exec("DELETE FROM local_announcements")

	stmt, err := tx.Prepare(`
		INSERT INTO local_announcements (id, type, title, content, is_urgent, target_roles, created_at, author_id, author_name, is_confirmed, attachments_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, d := range docs {
		uName := ""
		if d.Author != nil {
			uName = d.Author.Name
		}
		_, err = stmt.Exec(d.ID, d.Type, d.Title, d.Content, d.IsUrgent, d.TargetRoles, d.CreatedAt, d.AuthorID, uName, d.IsConfirmed, d.AttachmentsJSON)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	err = tx.Commit()
	if err != nil {
		return err
	}

	// Download files in background
	go func() {
		dir := a.getAnnouncementDir()
		log.Printf("[SyncAnnouncements] Starting background file download to directory: %s", dir)

		for _, d := range docs {
			if d.AttachmentsJSON != "" && d.AttachmentsJSON != "[]" && d.AttachmentsJSON != "null" {
				var files []LocalAnnouncementFile
				if err := json.Unmarshal([]byte(d.AttachmentsJSON), &files); err == nil {
					for _, f := range files {
						if f.URL != "" {
							filePath := filepath.Join(dir, fmt.Sprintf("%s_%s", d.ID, f.Name))
							if _, err := os.Stat(filePath); os.IsNotExist(err) {
								downloadUrl := apiBase + f.URL
								req, _ := http.NewRequest("GET", downloadUrl, nil)
								if token != "" {
									req.Header.Set("Authorization", "Bearer "+token)
								}
								client := &http.Client{}
								resp, err := client.Do(req)
								if err == nil {
									defer resp.Body.Close()
									if resp.StatusCode == 200 {
										out, _ := os.Create(filePath)
										if out != nil {
											io.Copy(out, resp.Body)
											out.Close()
										}
									}
								}
							}
						}
					}
				}
			}
		}
		log.Printf("[SyncAnnouncements] Background sync completed.")
	}()

	return nil
}

func (a *App) GetLocalAnnouncements() []LocalAnnouncement {
	if a.secureDB == nil {
		return []LocalAnnouncement{}
	}

	rows, err := a.secureDB.Query("SELECT id, type, title, content, is_urgent, target_roles, created_at, author_id, author_name, is_confirmed, attachments_json FROM local_announcements ORDER BY created_at DESC")
	if err != nil {
		return []LocalAnnouncement{}
	}
	defer rows.Close()

	var res []LocalAnnouncement
	for rows.Next() {
		var d LocalAnnouncement
		var authorName string
		err := rows.Scan(&d.ID, &d.Type, &d.Title, &d.Content, &d.IsUrgent, &d.TargetRoles, &d.CreatedAt, &d.AuthorID, &authorName, &d.IsConfirmed, &d.AttachmentsJSON)
		if err == nil {
			if authorName != "" {
				d.Author = &struct {
					Name string "json:\"name\""
					ID   string "json:\"id\""
				}{Name: authorName, ID: d.AuthorID}
			}
			res = append(res, d)
		}
	}
	return res
}

func (a *App) OpenLocalAnnouncementFile(announcementID string, filename string) error {
	dir := a.getAnnouncementDir()
	filePath := filepath.Join(dir, fmt.Sprintf("%s_%s", announcementID, filename))

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return fmt.Errorf("로컬에 다운로드된 파일이 없습니다 (동기화 지연 또는 오프라인 캐시 실패)")
	}

	cmd := exec.Command("cmd", "/c", "start", "", filePath)
	return cmd.Start()
}
