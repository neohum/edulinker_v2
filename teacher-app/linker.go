package main

import (
	"encoding/json"
	"fmt"
)

type Bookmark struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Url           string `json:"url"`
	StudentUrl    string `json:"student_url"`
	Category      string `json:"category"`
	IsShared      bool   `json:"is_shared"`
	ShareTeachers bool   `json:"share_teachers"`
	ShareClass    bool   `json:"share_class"`
	TargetIds     string `json:"target_ids"`
	IsOwn         bool   `json:"is_own"`
	SortOrder     int    `json:"sort_order"`
}

func (a *App) SyncLinkers(linkersJSON string) error {
	if a.secureDB == nil {
		return fmt.Errorf("local db not init")
	}

	var linkers []Bookmark
	if err := json.Unmarshal([]byte(linkersJSON), &linkers); err != nil {
		return err
	}

	tx, err := a.secureDB.Begin()
	if err != nil {
		return err
	}

	_, err = tx.Exec("DELETE FROM local_linkers")
	if err != nil {
		tx.Rollback()
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO local_linkers (id, title, url, student_url, category, is_shared, share_teachers, share_class, target_ids, is_own, sort_order)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, bm := range linkers {
		isShared := 0
		if bm.IsShared {
			isShared = 1
		}
		shareT := 0
		if bm.ShareTeachers {
			shareT = 1
		}
		shareC := 0
		if bm.ShareClass {
			shareC = 1
		}
		isOwn := 0
		if bm.IsOwn {
			isOwn = 1
		}

		_, err = stmt.Exec(bm.ID, bm.Title, bm.Url, bm.StudentUrl, bm.Category, isShared, shareT, shareC, bm.TargetIds, isOwn, bm.SortOrder)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func (a *App) GetLocalLinkers() []Bookmark {
	if a.secureDB == nil {
		return []Bookmark{}
	}

	rows, err := a.secureDB.Query("SELECT id, title, url, student_url, category, is_shared, share_teachers, share_class, target_ids, is_own, sort_order FROM local_linkers ORDER BY sort_order ASC")
	if err != nil {
		return []Bookmark{}
	}
	defer rows.Close()

	var res []Bookmark
	for rows.Next() {
		var b Bookmark
		var isShared, shareT, shareC, isOwn int
		err := rows.Scan(&b.ID, &b.Title, &b.Url, &b.StudentUrl, &b.Category, &isShared, &shareT, &shareC, &b.TargetIds, &isOwn, &b.SortOrder)
		if err == nil {
			b.IsShared = isShared == 1
			b.ShareTeachers = shareT == 1
			b.ShareClass = shareC == 1
			b.IsOwn = isOwn == 1
			res = append(res, b)
		}
	}
	return res
}
