package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// ensureDraftImagesDir computes and ensures the directory exists for local WebP images.
func ensureDraftImagesDir() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		appData = filepath.Join(home, ".edulinker")
	}
	draftDir := filepath.Join(appData, "edulinker", "draft_images")
	if err := os.MkdirAll(draftDir, 0755); err != nil {
		return "", err
	}
	return draftDir, nil
}

// LocalDraftMeta represents the metadata for a single resumed draft.
type LocalDraftMeta struct {
	ID               string   `json:"id"`
	Title            string   `json:"title"`
	FieldsJSON       string   `json:"fields_json"`
	StrokesJSON      string   `json:"strokes_json"`
	TargetUsersJSON  string   `json:"target_users_json"`
	OriginalFileName string   `json:"original_file_name"`
	UpdatedAt        string   `json:"updated_at"`
	PageImagesBase64 []string `json:"page_images_base64"` // Transmitted specifically for frontend resumption
}

func (a *App) DeleteLocalSendocDraft(id string) error {
	if a.secureDB == nil {
		return fmt.Errorf("로컬 DB 미초기화")
	}

	var imagePathsJSON string
	err := a.secureDB.QueryRow("SELECT image_paths_json FROM local_sendoc_drafts_v2 WHERE id = ?", id).Scan(&imagePathsJSON)
	if err == nil {
		var paths []string
		if json.Unmarshal([]byte(imagePathsJSON), &paths) == nil {
			for _, p := range paths {
				os.Remove(p)
			}
		}
	}

	_, err = a.secureDB.Exec("DELETE FROM local_sendoc_drafts_v2 WHERE id = ?", id)
	return err
}

func (a *App) SaveLocalSendocDraft(id, title, fieldsJson, strokesJson, targetUsersJson, fileName string, webpBase64Array []string) (string, error) {
	if a.secureDB == nil {
		return "", fmt.Errorf("로컬 DB 미초기화")
	}
	if id == "" {
		id = uuid.New().String()
	}

	draftDir, err := ensureDraftImagesDir()
	if err != nil {
		return "", fmt.Errorf("임시 폴더 관리 오류: %v", err)
	}

	var savedPaths []string
	for i, b64 := range webpBase64Array {
		fileName := fmt.Sprintf("%s_page%d.webp", id, i+1)
		targetPath := filepath.Join(draftDir, fileName)

		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return "", fmt.Errorf("base64 디코딩 실패 (페이지 %d): %v", i+1, err)
		}
		if err := os.WriteFile(targetPath, data, 0644); err != nil {
			return "", fmt.Errorf("파일 저장 쓰기 실패 (페이지 %d): %v", i+1, err)
		}
		savedPaths = append(savedPaths, targetPath)
	}

	pathsJson, _ := json.Marshal(savedPaths)

	_, err = a.secureDB.Exec(`
		INSERT INTO local_sendoc_drafts_v2 (id, title, fields_json, strokes_json, image_paths_json, target_users_json, original_file_name, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			fields_json = excluded.fields_json,
			strokes_json = excluded.strokes_json,
			image_paths_json = excluded.image_paths_json,
			target_users_json = excluded.target_users_json,
			original_file_name = excluded.original_file_name,
			updated_at = CURRENT_TIMESTAMP
	`, id, title, fieldsJson, strokesJson, string(pathsJson), targetUsersJson, fileName)

	if err != nil {
		return "", fmt.Errorf("로컬 DB 저장 실패: %v", err)
	}

	return id, nil
}

type DraftListItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	UpdatedAt string `json:"updated_at"`
}

func (a *App) GetLocalSendocDrafts() ([]DraftListItem, error) {
	if a.secureDB == nil {
		return nil, fmt.Errorf("로컬 DB 미초기화")
	}

	rows, err := a.secureDB.Query("SELECT id, title, updated_at FROM local_sendoc_drafts_v2 ORDER BY updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []DraftListItem
	for rows.Next() {
		var item DraftListItem
		var updated time.Time
		if err := rows.Scan(&item.ID, &item.Title, &updated); err == nil {
			item.UpdatedAt = updated.Format(time.RFC3339)
			list = append(list, item)
		}
	}
	return list, nil
}

func (a *App) GetLocalSendocDraft(id string) (LocalDraftMeta, error) {
	if a.secureDB == nil {
		return LocalDraftMeta{}, fmt.Errorf("로컬 DB 미초기화")
	}

	var meta LocalDraftMeta
	var imagePathsJSON string
	var updated time.Time

	err := a.secureDB.QueryRow(`
		SELECT id, title, fields_json, strokes_json, image_paths_json, target_users_json, original_file_name, updated_at 
		FROM local_sendoc_drafts_v2 
		WHERE id = ?
	`, id).Scan(&meta.ID, &meta.Title, &meta.FieldsJSON, &meta.StrokesJSON, &imagePathsJSON, &meta.TargetUsersJSON, &meta.OriginalFileName, &updated)

	if err != nil {
		return LocalDraftMeta{}, fmt.Errorf("초안 문서 조회 실패: %v", err)
	}
	meta.UpdatedAt = updated.Format(time.RFC3339)

	var paths []string
	if err := json.Unmarshal([]byte(imagePathsJSON), &paths); err == nil {
		var b64Images []string
		for _, p := range paths {
			if b, e := os.ReadFile(p); e == nil {
				b64Images = append(b64Images, base64.StdEncoding.EncodeToString(b))
			}
		}
		meta.PageImagesBase64 = b64Images
	}

	return meta, nil
}
