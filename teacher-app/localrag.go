package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	_ "modernc.org/sqlite"
)

// ── 로컬 RAG 엔진 (SQLite + Ollama) ──
// 서버는 문서 원본만 저장, 교사 PC에서 임베딩/검색/AI 처리

type LocalRAG struct {
	db  *sql.DB
	mu  sync.RWMutex
	app *App
}

type RAGSearchResult struct {
	DocID          string  `json:"doc_id"`
	DocTitle       string  `json:"doc_title"`
	SourceType     string  `json:"source_type"`
	DisplayText    string  `json:"display_text"`
	HeadingContext string  `json:"heading_context"`
	Score          float64 `json:"score"`
	IsSemantic     bool    `json:"is_semantic"`
}

// ── SQLite 초기화 ──

func (a *App) initLocalRAG() error {
	dbPath, err := localRAGDBPath()
	if err != nil {
		return fmt.Errorf("failed to get RAG db path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return fmt.Errorf("failed to create RAG dir: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_journal=WAL&_timeout=5000")
	if err != nil {
		return fmt.Errorf("failed to open RAG db: %w", err)
	}

	if err := migrateLocalRAG(db); err != nil {
		return fmt.Errorf("failed to migrate RAG db: %w", err)
	}

	a.rag = &LocalRAG{db: db, app: a}
	return nil
}

func localRAGDBPath() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		appData = filepath.Join(home, ".edulinker")
	}
	return filepath.Join(appData, "edulinker", "knowledge_rag.db"), nil
}

// rag_schema_version: 텍스트 인코딩 버그 수정 후 강제 재인덱싱용
// 버전이 다르면 모든 청크/임베딩 삭제 후 재인덱싱
const ragSchemaVersion = "v3"

func migrateLocalRAG(db *sql.DB) error {
	// 메타 테이블 (스키마 버전 관리)
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS rag_meta (key TEXT PRIMARY KEY, value TEXT);`)
	if err != nil {
		return err
	}

	// 스키마 버전 확인 — 구버전이면 데이터 삭제 (인코딩 버그 수정)
	var savedVersion string
	row := db.QueryRow("SELECT value FROM rag_meta WHERE key = 'schema_version'")
	_ = row.Scan(&savedVersion)
	if savedVersion != ragSchemaVersion {
		db.Exec("DROP TABLE IF EXISTS rag_embeddings")
		db.Exec("DROP TABLE IF EXISTS rag_chunks")
		db.Exec("INSERT OR REPLACE INTO rag_meta(key, value) VALUES ('schema_version', ?)", ragSchemaVersion)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS rag_chunks (
			id             TEXT PRIMARY KEY,
			doc_id         TEXT NOT NULL,
			doc_title      TEXT NOT NULL,
			source_type    TEXT NOT NULL,
			chunk_index    INTEGER NOT NULL,
			chunk_text     TEXT NOT NULL,
			display_text   TEXT NOT NULL,
			heading_context TEXT NOT NULL,
			doc_hash       TEXT NOT NULL,
			created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_id ON rag_chunks(doc_id);
		CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_hash ON rag_chunks(doc_id, doc_hash);
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS rag_embeddings (
			chunk_id  TEXT PRIMARY KEY,
			embedding BLOB NOT NULL
		);
	`)
	return err
}

// ── 청킹 ──

type chunkResult struct {
	text           string
	displayText    string
	headingContext string
	index          int
}

func splitMarkdownChunks(content, docTitle string, maxLen, overlap int) []chunkResult {
	lines := strings.Split(content, "\n")

	type section struct {
		heading string
		body    string
	}

	var sections []section
	currentHeading := docTitle
	var currentLines []string
	headingStack := make([]string, 0, 3)

	flush := func() {
		body := strings.TrimSpace(strings.Join(currentLines, "\n"))
		if body != "" {
			sections = append(sections, section{heading: currentHeading, body: body})
		}
		currentLines = currentLines[:0]
	}

	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "### "):
			flush()
			h := strings.TrimPrefix(line, "### ")
			base := append([]string{}, headingStack[:min2(len(headingStack), 2)]...)
			currentHeading = strings.Join(append(base, h), " > ")
		case strings.HasPrefix(line, "## "):
			flush()
			h := strings.TrimPrefix(line, "## ")
			if len(headingStack) >= 2 {
				headingStack[1] = h
				headingStack = headingStack[:2]
			} else if len(headingStack) == 1 {
				headingStack = append(headingStack, h)
			} else {
				headingStack = []string{h}
			}
			currentHeading = strings.Join(headingStack, " > ")
		case strings.HasPrefix(line, "# "):
			flush()
			h := strings.TrimPrefix(line, "# ")
			headingStack = []string{h}
			currentHeading = h
		default:
			currentLines = append(currentLines, line)
		}
	}
	flush()

	var result []chunkResult
	idx := 0

	for _, sec := range sections {
		body := sec.body
		if utf8.RuneCountInString(body) < 50 {
			continue
		}
		prefix := "[" + sec.heading + "]\n"

		if utf8.RuneCountInString(body) <= maxLen {
			result = append(result, chunkResult{
				text:           prefix + body,
				displayText:    body,
				headingContext: sec.heading,
				index:          idx,
			})
			idx++
			continue
		}

		// 슬라이딩 윈도우 (rune 기준으로 계산하여 한국어 UTF-8 깨짐 방지)
		sentences := strings.Split(body, "\n")
		buf := ""
		prevTail := ""

		for _, sent := range sentences {
			sent = strings.TrimSpace(sent)
			if sent == "" {
				continue
			}
			bufRunes := utf8.RuneCountInString(buf)
			sentRunes := utf8.RuneCountInString(sent)
			if bufRunes+sentRunes > maxLen && bufRunes >= 50 {
				chunkBody := strings.TrimSpace(prevTail + buf)
				result = append(result, chunkResult{
					text:           prefix + chunkBody,
					displayText:    chunkBody,
					headingContext: sec.heading,
					index:          idx,
				})
				idx++
				// rune 기준으로 overlap 슬라이싱 (바이트 슬라이싱 금지)
				if bufRunes > overlap {
					runes := []rune(buf)
					prevTail = string(runes[len(runes)-overlap:])
				} else {
					prevTail = buf
				}
				buf = sent
			} else {
				if buf != "" {
					buf += " "
				}
				buf += sent
			}
		}
		if utf8.RuneCountInString(strings.TrimSpace(buf)) >= 50 {
			chunkBody := strings.TrimSpace(prevTail + buf)
			result = append(result, chunkResult{
				text:           prefix + chunkBody,
				displayText:    chunkBody,
				headingContext: sec.heading,
				index:          idx,
			})
			idx++
		}
	}
	return result
}

func min2(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ── 해시 ──

func simpleHash(s string) string {
	h := int32(0)
	n := len(s)
	if n > 3000 {
		n = 3000
	}
	for i := 0; i < n; i++ {
		h = h*31 + int32(s[i])
	}
	return fmt.Sprintf("%x", uint32(h))
}

// ── 임베딩 ──

func getLocalEmbedding(ctx context.Context, text string) ([]float64, error) {
	body, _ := json.Marshal(map[string]string{
		"model":  "nomic-embed-text",
		"prompt": text,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", "http://localhost:11434/api/embeddings", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Embedding []float64 `json:"embedding"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Embedding, nil
}

func embeddingToBlob(vec []float64) ([]byte, error) {
	return json.Marshal(vec)
}

func blobToEmbedding(blob []byte) ([]float64, error) {
	var vec []float64
	return vec, json.Unmarshal(blob, &vec)
}

// ── 코사인 유사도 ──

func cosineSim(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

// ── BM25 ──

func bm25Score(query, text string, avgLen float64) float64 {
	const k1, b = 1.5, 0.75
	terms := strings.FieldsFunc(strings.ToLower(query), func(r rune) bool {
		return r == ' ' || r == ',' || r == '.' || r == '?' || r == ':'
	})
	words := strings.Fields(strings.ToLower(text))
	docLen := float64(len(words))
	freq := make(map[string]int)
	for _, w := range words {
		freq[w]++
	}

	var score float64
	for _, term := range terms {
		if len(term) < 2 {
			continue
		}
		tf := 0
		for w, cnt := range freq {
			if strings.Contains(w, term) {
				tf += cnt
			}
		}
		if tf == 0 {
			continue
		}
		idf := math.Log(1 + 1.0/(0.5+0.5))
		tfNorm := float64(tf) * (k1 + 1) / (float64(tf) + k1*(1-b+b*(docLen/math.Max(avgLen, 1))))
		score += idf * tfNorm
	}
	return score
}

// ── Wails 바인딩 함수들 ──

// IndexDocument: 문서를 청킹/임베딩해서 로컬 SQLite에 저장
// 문서 내용이 변경된 경우만 재처리 (해시 기반)
func (a *App) IndexDocument(docID, docTitle, sourceType, markdownContent string) error {
	if a.rag == nil {
		return fmt.Errorf("RAG engine not initialized")
	}

	hash := simpleHash(markdownContent)

	// 해시 확인 — 변경 없으면 스킵
	var existingHash string
	row := a.rag.db.QueryRow("SELECT doc_hash FROM rag_chunks WHERE doc_id = ? LIMIT 1", docID)
	_ = row.Scan(&existingHash)
	if existingHash == hash {
		return nil // 변경 없음
	}

	// 기존 청크 삭제
	a.rag.db.Exec("DELETE FROM rag_embeddings WHERE chunk_id IN (SELECT id FROM rag_chunks WHERE doc_id = ?)", docID)
	a.rag.db.Exec("DELETE FROM rag_chunks WHERE doc_id = ?", docID)

	chunks := splitMarkdownChunks(markdownContent, docTitle, 400, 100)

	for _, ch := range chunks {
		chunkID := fmt.Sprintf("%s_%d", docID, ch.index)

		// SQLite에 텍스트 저장
		_, err := a.rag.db.Exec(`
			INSERT INTO rag_chunks(id, doc_id, doc_title, source_type, chunk_index, chunk_text, display_text, heading_context, doc_hash)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			chunkID, docID, docTitle, sourceType, ch.index,
			ch.text, ch.displayText, ch.headingContext, hash,
		)
		if err != nil {
			continue
		}

		// Ollama 임베딩
		vec, err := getLocalEmbedding(context.Background(), ch.text)
		if err != nil || len(vec) == 0 {
			continue
		}

		blob, err := embeddingToBlob(vec)
		if err != nil {
			continue
		}

		a.rag.db.Exec(
			"INSERT OR REPLACE INTO rag_embeddings(chunk_id, embedding) VALUES (?, ?)",
			chunkID, blob,
		)
	}

	return nil
}

// DeleteDocumentIndex: 문서 인덱스 삭제
func (a *App) DeleteDocumentIndex(docID string) error {
	if a.rag == nil {
		return nil
	}
	a.rag.db.Exec("DELETE FROM rag_embeddings WHERE chunk_id IN (SELECT id FROM rag_chunks WHERE doc_id = ?)", docID)
	a.rag.db.Exec("DELETE FROM rag_chunks WHERE doc_id = ?", docID)
	return nil
}

// SearchKnowledge: BM25 + 시맨틱 RRF 검색
func (a *App) SearchKnowledge(query string, topK int) ([]RAGSearchResult, error) {
	if a.rag == nil {
		return nil, fmt.Errorf("RAG engine not initialized")
	}
	if topK <= 0 || topK > 10 {
		topK = 5
	}

	// 모든 청크 로드
	rows, err := a.rag.db.Query(`
		SELECT c.id, c.doc_id, c.doc_title, c.source_type,
		       c.chunk_index, c.chunk_text, c.display_text, c.heading_context,
		       e.embedding
		FROM rag_chunks c
		LEFT JOIN rag_embeddings e ON e.chunk_id = c.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type chunk struct {
		id, docID, docTitle, sourceType        string
		chunkIndex                             int
		chunkText, displayText, headingContext string
		embedding                              []float64
	}

	var chunks []chunk
	for rows.Next() {
		var c chunk
		var embBlob []byte
		if err := rows.Scan(&c.id, &c.docID, &c.docTitle, &c.sourceType,
			&c.chunkIndex, &c.chunkText, &c.displayText, &c.headingContext,
			&embBlob); err != nil {
			continue
		}
		if embBlob != nil {
			c.embedding, _ = blobToEmbedding(embBlob)
		}
		chunks = append(chunks, c)
	}

	if len(chunks) == 0 {
		return []RAGSearchResult{}, nil
	}

	// BM25 계산
	totalWords := 0
	for _, c := range chunks {
		totalWords += len(strings.Fields(c.displayText))
	}
	avgLen := float64(totalWords) / float64(len(chunks))

	type scored struct {
		c           chunk
		bm25        float64
		sem         float64
		fusionScore float64
	}

	var bm25List []scored
	for _, c := range chunks {
		searchText := c.docTitle + " " + c.headingContext + " " + c.displayText
		score := bm25Score(query, searchText, avgLen)
		if score > 0.1 {
			bm25List = append(bm25List, scored{c: c, bm25: score})
		}
	}
	sort.Slice(bm25List, func(i, j int) bool { return bm25List[i].bm25 > bm25List[j].bm25 })

	// 시맨틱 검색
	var semList []scored
	hasVec := false

	queryVec, embErr := getLocalEmbedding(context.Background(), query)
	if embErr == nil && len(queryVec) > 0 {
		hasVec = true
		for _, c := range chunks {
			if len(c.embedding) > 0 {
				sim := cosineSim(queryVec, c.embedding)
				if sim >= 0.45 { // 임계값 (원하는 경우 조절)
					semList = append(semList, scored{c: c, sem: sim})
				}
			}
		}
		sort.Slice(semList, func(i, j int) bool { return semList[i].sem > semList[j].sem })
	}

	// RRF 융합
	const rrfK = 60
	fusionMap := make(map[string]*scored)

	addRRF := func(list []scored, weight float64, limit int) {
		for rank, item := range list {
			if rank >= limit {
				break
			}
			key := item.c.id
			val := weight / float64(rrfK+rank+1)
			if existing, ok := fusionMap[key]; ok {
				existing.fusionScore += val
			} else {
				cp := item
				cp.fusionScore = val
				fusionMap[key] = &cp
			}
		}
	}

	addRRF(bm25List, 1.0, 20)
	if hasVec {
		addRRF(semList, 1.2, 20)
	}

	fusionList := make([]*scored, 0, len(fusionMap))
	for _, v := range fusionMap {
		fusionList = append(fusionList, v)
	}
	sort.Slice(fusionList, func(i, j int) bool {
		return fusionList[i].fusionScore > fusionList[j].fusionScore
	})

	// 문서별 중복 제거
	results := make([]RAGSearchResult, 0, topK)
	seenDocs := make(map[string]bool)

	for _, item := range fusionList {
		if len(results) >= topK {
			break
		}
		if seenDocs[item.c.docID] {
			continue
		}
		seenDocs[item.c.docID] = true

		displayText := item.c.displayText
		if item.c.headingContext != "" && item.c.headingContext != item.c.docTitle {
			displayText = "[" + item.c.headingContext + "]\n" + displayText
		}

		results = append(results, RAGSearchResult{
			DocID:          item.c.docID,
			DocTitle:       item.c.docTitle,
			SourceType:     item.c.sourceType,
			DisplayText:    displayText,
			HeadingContext: item.c.headingContext,
			Score:          item.fusionScore,
			IsSemantic:     hasVec,
		})
	}

	return results, nil
}

// GetIndexedDocIDs: 로컬에 인덱싱된 문서 ID 목록 반환 (프론트에서 동기화 판단용)
func (a *App) GetIndexedDocIDs() ([]string, error) {
	if a.rag == nil {
		return nil, nil
	}
	rows, err := a.rag.db.Query("SELECT DISTINCT doc_id FROM rag_chunks")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}
