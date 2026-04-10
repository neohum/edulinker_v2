package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

type KnowledgeDocUser struct {
	Name     string `json:"name"`
	Grade    int    `json:"grade"`
	ClassNum int    `json:"class_num"`
}

type KnowledgeDoc struct {
	ID               string            `json:"id"`
	Title            string            `json:"title"`
	SourceType       string            `json:"source_type"`
	OriginalFilename string            `json:"original_filename"`
	FileUrl          string            `json:"file_url"`
	MarkdownContent  string            `json:"markdown_content"`
	CreatedAt        string            `json:"created_at"`
	User             *KnowledgeDocUser `json:"user,omitempty"`
}

func (a *App) getKnowledgeDir() string {
	exePath, err := os.Executable()
	if err != nil {
		// fallback to current dir
		dir := filepath.Join("knowledge_files")
		os.MkdirAll(dir, 0755)
		return dir
	}
	dir := filepath.Join(filepath.Dir(exePath), "knowledge_files")
	os.MkdirAll(dir, 0755)
	return dir
}

func getSafeExt(originalFilename string, fileUrl string) string {
	ext := filepath.Ext(originalFilename)
	if ext == "" {
		ext = filepath.Ext(fileUrl)
	}
	if ext == "" {
		if strings.Contains(strings.ToLower(originalFilename), "pdf") || strings.Contains(strings.ToLower(fileUrl), "pdf") {
			ext = ".pdf"
		} else {
			ext = ".hwp" // fallback
		}
	}
	return ext
}

var syncKnowledgeMutex sync.Mutex

func (a *App) SyncKnowledge(docsJSON, apiBase string, token string) error {
	syncKnowledgeMutex.Lock()
	defer syncKnowledgeMutex.Unlock()

	if a.secureDB == nil {
		return fmt.Errorf("local db not init")
	}
	var docs []KnowledgeDoc
	if err := json.Unmarshal([]byte(docsJSON), &docs); err != nil {
		return err
	}

	tx, err := a.secureDB.Begin()
	if err != nil {
		return err
	}
	tx.Exec("DELETE FROM local_knowledge")

	stmt, err := tx.Prepare(`
		INSERT INTO local_knowledge (id, title, source_type, original_filename, file_url, markdown_content, created_at, user_name, user_grade, user_class_num)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, d := range docs {
		uName := ""
		uGrade := 0
		uClass := 0
		if d.User != nil {
			uName = d.User.Name
			uGrade = d.User.Grade
			uClass = d.User.ClassNum
		}
		_, err = stmt.Exec(d.ID, d.Title, d.SourceType, d.OriginalFilename, d.FileUrl, d.MarkdownContent, d.CreatedAt, uName, uGrade, uClass)
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
		dir := a.getKnowledgeDir()
		log.Printf("[SyncKnowledge] Starting background file download to directory: %s", dir)

		for _, d := range docs {
			if d.FileUrl != "" {
				ext := getSafeExt(d.OriginalFilename, d.FileUrl)
				filePath := filepath.Join(dir, d.ID+ext)
				if _, err := os.Stat(filePath); os.IsNotExist(err) {
					// URL-encode path segments to handle Korean characters and spaces
					segments := strings.Split(d.FileUrl, "/")
					for i, seg := range segments {
						segments[i] = url.PathEscape(seg)
					}
					encodedPath := strings.Join(segments, "/")
					downloadUrl := apiBase + encodedPath
					log.Printf("[SyncKnowledge] Checking download for %s -> URL: %s", d.OriginalFilename, downloadUrl)
					req, _ := http.NewRequest("GET", downloadUrl, nil)
					if token != "" {
						req.Header.Set("Authorization", "Bearer "+token)
					}
					client := &http.Client{}
					resp, err := client.Do(req)
					if err != nil {
						log.Printf("[SyncKnowledge] Download failed for '%s': %v", d.OriginalFilename, err)
					} else {
						defer resp.Body.Close()
						if resp.StatusCode == 200 {
							out, errCreate := os.Create(filePath)
							if errCreate != nil {
								log.Printf("[SyncKnowledge] Could not create local file '%s': %v", filePath, errCreate)
							} else {
								_, errCopy := io.Copy(out, resp.Body)
								out.Close()
								if errCopy != nil {
									log.Printf("[SyncKnowledge] Could not copy body '%s': %v", filePath, errCopy)
								} else {
									log.Printf("[SyncKnowledge] Successfully downloaded: %s", filePath)
								}
							}
						} else {
							log.Printf("[SyncKnowledge] Download HTTP %d for '%s'", resp.StatusCode, d.OriginalFilename)
						}
					}
				} else {
					log.Printf("[SyncKnowledge] File already exists: %s", filePath)
				}
			}
		}
		log.Printf("[SyncKnowledge] Background sync completed.")
	}()

	return nil
}

func (a *App) GetLocalKnowledge() []KnowledgeDoc {
	if a.secureDB == nil {
		return []KnowledgeDoc{}
	}

	rows, err := a.secureDB.Query("SELECT id, title, source_type, original_filename, file_url, markdown_content, created_at, user_name, user_grade, user_class_num FROM local_knowledge ORDER BY created_at DESC")
	if err != nil {
		return []KnowledgeDoc{}
	}
	defer rows.Close()

	var res []KnowledgeDoc
	for rows.Next() {
		var d KnowledgeDoc
		var uName string
		var uGrade, uClass int
		err := rows.Scan(&d.ID, &d.Title, &d.SourceType, &d.OriginalFilename, &d.FileUrl, &d.MarkdownContent, &d.CreatedAt, &uName, &uGrade, &uClass)
		if err == nil {
			if uName != "" {
				d.User = &KnowledgeDocUser{Name: uName, Grade: uGrade, ClassNum: uClass}
			}
			res = append(res, d)
		}
	}
	return res
}

func (a *App) OpenLocalKnowledgeFile(docID string, filename string) error {
	dir := a.getKnowledgeDir()
	ext := getSafeExt(filename, "")
	filePath := filepath.Join(dir, docID+ext)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// fallback to check if it exists without extension (from old code)
		oldPath := filepath.Join(dir, docID)
		if _, oldErr := os.Stat(oldPath); oldErr == nil {
			// Rename it to the new path with ext so it works from now on
			os.Rename(oldPath, filePath)
		} else {
			return fmt.Errorf("로컬에 다운로드된 파일이 없습니다 (동기화 지연 또는 오프라인 캐시 실패)")
		}
	}

	cmd := exec.Command("cmd", "/c", "start", "", filePath)
	return cmd.Start()
}
