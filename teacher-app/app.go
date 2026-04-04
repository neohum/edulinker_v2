package main

import (
	"bytes"
	"context"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/getlantern/systray"
	"github.com/go-ole/go-ole"
	"github.com/ledongthuc/pdf"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

// httpClient with generous timeout for large file uploads.
var httpClient = &http.Client{
	Timeout: 30 * time.Minute,
}

// App struct holds the application state and context.
type App struct {
	ctx           context.Context
	apiBase       string
	authToken     string
	hwpMutex      sync.Mutex
	hwpObject     *ole.IDispatch
	hwpTaskChan   chan hwpTask
	hwpWorkerOnce sync.Once
	hancomStatus  map[string]interface{} // cached on startup
	aiCancel      context.CancelFunc     // cancel func for ongoing AI generation
	rag           *LocalRAG              // 로컬 RAG 엔진 (SQLite + Ollama)
	secureDB      *sql.DB                // 로컬 보안 DB (출결, 상담, 투두, 등)
}

type hwpTask struct {
	inputPath  string
	outputPath string
	outputType string
	respChan   chan error
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{
		apiBase:     "http://localhost:5200",
		hwpTaskChan: make(chan hwpTask, 1),
	}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Kill any leftover HWP processes from previous runs
	exec.Command("taskkill", "/F", "/IM", "Hwp.exe", "/T").Run()
	a.hancomStatus = a.CheckHancom()
	a.hwpWorkerOnce.Do(func() {
		go a.startHwpWorker()
	})

	// 로컬 RAG 엔진 초기화 (SQLite)
	if err := a.initLocalRAG(); err != nil {
		fmt.Println("[RAG] Failed to initialize local RAG engine:", err)
	}

	// 암호화 키 초기화
	if err := InitCryptoKey(); err != nil {
		fmt.Println("[Security] Failed to init local crypto key:", err)
	}

	// 로컬 보안 DB 초기화 (SQLite)
	if err := a.initSecureDB(); err != nil {
		fmt.Println("[DB] Failed to initialize secure db:", err)
	}

	go systray.Run(a.onTrayReady, a.onTrayExit)
}

func (a *App) onTrayReady() {
	systray.SetIcon(trayIcon)
	systray.SetTitle("edulinker")
	systray.SetTooltip("edulinker 교사용 앱")

	mShow := systray.AddMenuItem("열기", "앱 화면을 엽니다")
	mQuit := systray.AddMenuItem("완전 종료", "앱을 완전히 종료합니다")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				if a.ctx != nil {
					wailsRuntime.WindowShow(a.ctx)
				}
			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

// GenerateAISync performs a blocking, non-streaming generation request to Ollama and returns the finalized string.
func (a *App) GenerateAISync(model, prompt string) (string, error) {
	reqBody := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"num_ctx":     4096,
			"num_predict": 2048,
			"temperature": 0.6,
			"top_k":       20,
			"top_p":       0.5,
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("serialize error: %v", err)
	}

	req, err := http.NewRequest("POST", "http://localhost:11434/api/generate", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("request creation error: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Ollama 서버 오류 (localhost:11434 연결 실패)")
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("Ollama 서버 HTTP %d", resp.StatusCode)
	}

	var result struct {
		Response string `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("parse error: %v", err)
	}

	return result.Response, nil
}

func (a *App) onTrayExit() {
	if a.ctx != nil {
		wailsRuntime.Quit(a.ctx)
	}
}

// --- Text Extraction ---

// ConvertToMarkdownResult is returned from ConvertToMarkdown.
type ConvertToMarkdownResult struct {
	Success bool   `json:"success"`
	Text    string `json:"text"`
	Error   string `json:"error,omitempty"`
}

// ConvertToMarkdown converts HWP/HWPX/TXT files into text format (Markdown) for AI processing.
func (a *App) ConvertToMarkdown(filename, base64data string) ConvertToMarkdownResult {
	ext := strings.ToLower(filepath.Ext(filename))

	if ext == ".hwp" || ext == ".hwpx" || ext == ".pdf" {
		resKordoc := a.ConvertWithKordoc(filename, base64data)
		if resKordoc.Success {
			return resKordoc
		}

		if ext == ".pdf" {
			res := a.ConvertPdfToText(base64data)
			if !res.Success {
				return ConvertToMarkdownResult{Error: res.Error}
			}
			return ConvertToMarkdownResult{Success: true, Text: res.Text}
		} else {
			res := a.ConvertHwpToText(filename, base64data)
			if !res.Success {
				return ConvertToMarkdownResult{Error: res.Error}
			}
			return ConvertToMarkdownResult{Success: true, Text: res.Text}
		}
	} else if ext == ".txt" || ext == ".md" || ext == ".csv" {
		data, err := base64.StdEncoding.DecodeString(base64data)
		if err != nil {
			return ConvertToMarkdownResult{Error: "디코딩 실패"}
		}
		return ConvertToMarkdownResult{Success: true, Text: string(data)}
	}

	return ConvertToMarkdownResult{Error: "지원하지 않는 파일 형식입니다: " + ext}
}

// ConvertWithKordoc runs the local kordoc_parser.mjs node script to extract Markdown from a document.
func (a *App) ConvertWithKordoc(filename, base64data string) ConvertToMarkdownResult {
	fileData, err := base64.StdEncoding.DecodeString(base64data)
	if err != nil {
		return ConvertToMarkdownResult{Error: "디코딩 실패"}
	}

	tmpFile, err := os.CreateTemp("", "*_"+filepath.Base(filename))
	if err != nil {
		return ConvertToMarkdownResult{Error: "임시 파일 생성 실패"}
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(fileData); err != nil {
		return ConvertToMarkdownResult{Error: "임시 파일 쓰기 실패"}
	}
	tmpFile.Close()

	cmd := exec.Command("node", "kordoc_parser.mjs", tmpFile.Name())
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	err = cmd.Run()
	if err != nil {
		return ConvertToMarkdownResult{Error: fmt.Sprintf("Kordoc 오류: %v, %s", err, errBuf.String())}
	}

	if outBuf.Len() > 0 {
		return ConvertToMarkdownResult{Success: true, Text: outBuf.String()}
	}
	return ConvertToMarkdownResult{Error: "추출된 내부 텍스트가 없습니다"}
}

// ConvertPdfToText extracts raw text from a PDF securely via Go bytes.
func (a *App) ConvertPdfToText(base64data string) ConvertToMarkdownResult {
	pdfData, err := base64.StdEncoding.DecodeString(base64data)
	if err != nil {
		return ConvertToMarkdownResult{Error: "PDF 데이터 디코딩 실패"}
	}

	r, err := pdf.NewReader(bytes.NewReader(pdfData), int64(len(pdfData)))
	if err != nil {
		return ConvertToMarkdownResult{Error: "PDF 리더를 초기화할 수 없습니다."}
	}

	var buf bytes.Buffer
	b, err := r.GetPlainText()
	if err != nil {
		return ConvertToMarkdownResult{Error: "PDF 텍스트를 추출하는 중 오류가 발생했습니다."}
	}
	buf.ReadFrom(b)

	return ConvertToMarkdownResult{Success: true, Text: buf.String()}
}

// --- Auth ---

// LoginRequest represents the login payload.
type LoginRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

// RegisterRequest represents the registration payload.
type RegisterRequest struct {
	SchoolCode string `json:"school_code"`
	SchoolName string `json:"school_name"`
	Name       string `json:"name"`
	Phone      string `json:"phone"`
	Password   string `json:"password"`
	Role       string `json:"role"`
}

// LoginResult is the response from the login API.
type LoginResult struct {
	Success      bool   `json:"success"`
	Token        string `json:"token"`
	RefreshToken string `json:"refresh_token"`
	UserID       string `json:"user_id"`
	UserName     string `json:"user_name"`
	UserRole     string `json:"user_role"`
	SchoolName   string `json:"school_name"`
	Department   string `json:"department"`
	TaskName     string `json:"task_name"`
	ClassPhone   string `json:"class_phone"`
	Grade        int    `json:"grade"`
	ClassNum     int    `json:"class_num"`
	Error        string `json:"error,omitempty"`
	IsOffline    bool   `json:"is_offline,omitempty"`
}

// Register registers a new user with the API server and signs them in.
func (a *App) Register(schoolCode, schoolName, name, phone, password, role, classPhone, department, taskName string, grade, classNum int) LoginResult {
	reqData := map[string]interface{}{
		"school_code": schoolCode,
		"school_name": schoolName,
		"name":        name,
		"phone":       phone,
		"password":    password,
		"role":        role,
		"class_phone": classPhone,
		"department":  department,
		"task_name":   taskName,
		"grade":       grade,
		"class_num":   classNum,
	}
	bodyBytes, _ := json.Marshal(reqData)
	resp, err := http.Post(a.apiBase+"/api/auth/register", "application/json", bytes.NewReader(bodyBytes))
	if err != nil {
		return LoginResult{Success: false, Error: "서버에 연결할 수 없습니다"}
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 201 {
		var errResp map[string]string
		json.Unmarshal(data, &errResp)
		if errResp["error"] != "" {
			return LoginResult{Success: false, Error: errResp["error"]}
		}
		return LoginResult{Success: false, Error: "회원가입에 실패했습니다"}
	}

	var result map[string]interface{}
	json.Unmarshal(data, &result)

	a.authToken = result["token"].(string)

	user := result["user"].(map[string]interface{})
	school := user["school"].(map[string]interface{})

	uid, _ := user["id"].(string)
	dept, _ := user["department"].(string)
	task, _ := user["task_name"].(string)
	cp, _ := user["class_phone"].(string)
	var g, c int
	if gVal, ok := user["grade"].(float64); ok {
		g = int(gVal)
	}
	if cVal, ok := user["class_num"].(float64); ok {
		c = int(cVal)
	}

	return LoginResult{
		Success:      true,
		Token:        a.authToken,
		RefreshToken: result["refresh_token"].(string),
		UserID:       uid,
		UserName:     user["name"].(string),
		UserRole:     user["role"].(string),
		SchoolName:   school["name"].(string),
		Department:   dept,
		TaskName:     task,
		ClassPhone:   cp,
		Grade:        g,
		ClassNum:     c,
	}
}

// Login authenticates and stores the JWT token.
func (a *App) Login(phone, password string) LoginResult {
	body := fmt.Sprintf(`{"phone":"%s","password":"%s"}`, phone, password)

	client := &http.Client{Timeout: 3 * time.Second}
	req, _ := http.NewRequest("POST", a.apiBase+"/api/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		// Server unreachable or timeout -> Fallback to SQLite offline login
		return a.verifyOfflineLogin(phone, password)
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		var errResp map[string]string
		json.Unmarshal(data, &errResp)
		// Request actually reached the server but was rejected (e.g., bad password)
		return LoginResult{Success: false, Error: errResp["error"]}
	}

	var result map[string]interface{}
	json.Unmarshal(data, &result)

	a.authToken = result["token"].(string)

	user := result["user"].(map[string]interface{})
	school := user["school"].(map[string]interface{})

	uid, _ := user["id"].(string)
	dept, _ := user["department"].(string)
	task, _ := user["task_name"].(string)
	cp, _ := user["class_phone"].(string)
	var g, c int
	if gVal, ok := user["grade"].(float64); ok {
		g = int(gVal)
	}
	if cVal, ok := user["class_num"].(float64); ok {
		c = int(cVal)
	}

	lr := LoginResult{
		Success:      true,
		Token:        a.authToken,
		RefreshToken: result["refresh_token"].(string),
		UserID:       uid,
		UserName:     user["name"].(string),
		UserRole:     user["role"].(string),
		SchoolName:   school["name"].(string),
		Department:   dept,
		TaskName:     task,
		ClassPhone:   cp,
		Grade:        g,
		ClassNum:     c,
	}

	// Cache successful login for future offline use
	profileBytes, _ := json.Marshal(lr)
	a.saveOfflineLogin(phone, password, string(profileBytes))

	return lr
}

// GetToken returns the current JWT token for frontend API calls.
func (a *App) GetToken() string {
	return a.authToken
}

// IsLoggedIn checks if the user has a valid token.
func (a *App) IsLoggedIn() bool {
	return a.authToken != ""
}

// Logout clears the current session.
func (a *App) Logout() {
	a.authToken = ""
}

// SetAPIBase updates the base API URL used by the Go backend proxy.
func (a *App) SetAPIBase(url string) {
	// Strip trailing slashes to avoid double-slash issues in endpoints
	a.apiBase = strings.TrimRight(url, "/")
}

// CheckConnection pings the backend server directly to verify connectivity, avoiding WebView CORS/PNA issues.
func (a *App) CheckConnection() bool {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(a.apiBase + "/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

// --- NEIS API ---

// SchoolResult represents the school data sent to the frontend.
type SchoolResult struct {
	Name    string `json:"name"`
	Code    string `json:"code"`
	Address string `json:"address"`
	Region  string `json:"region"`
}

// SearchSchool searches for schools by name using the Open NEIS API.
func (a *App) SearchSchool(query string) ([]SchoolResult, error) {
	apiKey := "e6f150bd4fe14dde85c323a3ee241260"
	encodedQuery := url.QueryEscape(query)
	reqUrl := fmt.Sprintf("https://open.neis.go.kr/hub/schoolInfo?KEY=%s&Type=json&pIndex=1&pSize=50&SCHUL_NM=%s", apiKey, encodedQuery)
	resp, err := http.Get(reqUrl)
	if err != nil {
		return nil, fmt.Errorf("NEIS API 연결 실패: %v", err)
	}
	defer resp.Body.Close()

	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("NEIS 응답 파싱 실패")
	}

	schoolInfoObj, ok := data["schoolInfo"]
	if !ok {
		// No results
		return []SchoolResult{}, nil
	}

	schoolInfoList, ok := schoolInfoObj.([]interface{})
	if !ok || len(schoolInfoList) < 2 {
		return []SchoolResult{}, nil
	}

	rowsObj := schoolInfoList[1].(map[string]interface{})
	rows, ok := rowsObj["row"].([]interface{})
	if !ok {
		return []SchoolResult{}, nil
	}

	var results []SchoolResult
	for _, rawRow := range rows {
		row := rawRow.(map[string]interface{})

		name, _ := row["SCHUL_NM"].(string)
		code, _ := row["SD_SCHUL_CODE"].(string)
		addr, _ := row["ORG_RDNMA"].(string)
		region, _ := row["LCTN_SC_NM"].(string)

		results = append(results, SchoolResult{
			Name:    name,
			Code:    code,
			Address: addr,
			Region:  region,
		})
	}

	return results, nil
}

// --- Plugins ---

// PluginInfo represents plugin data returned to the frontend.
type PluginInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	GroupCode   string `json:"group_code"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
	Icon        string `json:"icon"`
}

// GetPlugins returns the list of plugins for the current school.
func (a *App) GetPlugins() ([]PluginInfo, error) {
	req, _ := http.NewRequest("GET", a.apiBase+"/api/core/plugins", nil)
	req.Header.Set("Authorization", "Bearer "+a.authToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("서버에 연결할 수 없습니다")
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	var plugins []PluginInfo
	if err := json.Unmarshal(data, &plugins); err != nil {
		return nil, fmt.Errorf("플러그인 목록을 파싱할 수 없습니다")
	}

	return plugins, nil
}

// --- System Info ---

// SystemInfo returns OS and runtime info for display.
type SystemInfo struct {
	OS     string `json:"os"`
	Arch   string `json:"arch"`
	GoVer  string `json:"go_version"`
	NumCPU int    `json:"num_cpu"`
}

// GetSystemInfo returns basic system information.
func (a *App) GetSystemInfo() SystemInfo {
	return SystemInfo{
		OS:     runtime.GOOS,
		Arch:   runtime.GOARCH,
		GoVer:  runtime.Version(),
		NumCPU: runtime.NumCPU(),
	}
}

// AIBenchmark contains hardware info and AI readiness score.
type AIBenchmark struct {
	// Hardware info
	Hostname    string  `json:"hostname"`
	IPAddress   string  `json:"ip_address"`
	CPUName     string  `json:"cpu_name"`
	CPUCores    int     `json:"cpu_cores"`
	CPUThreads  int     `json:"cpu_threads"`
	RAMTotalGB  float64 `json:"ram_total_gb"`
	RAMFreeGB   float64 `json:"ram_free_gb"`
	GPUName     string  `json:"gpu_name"`
	GPUMemoryMB int     `json:"gpu_memory_mb"`
	DiskFreeGB  float64 `json:"disk_free_gb"`
	MACAddress  string  `json:"mac_address"`

	// Scores (0-100)
	CPUScore  int `json:"cpu_score"`
	RAMScore  int `json:"ram_score"`
	GPUScore  int `json:"gpu_score"`
	DiskScore int `json:"disk_score"`

	// Overall: 1~6 grade
	Grade       int    `json:"grade"` // 1=최상 ~ 6=부적합
	GradeLabel  string `json:"grade_label"`
	GradeDesc   string `json:"grade_desc"`
	RecommModel string `json:"recomm_model"`

	// External Hardware
	Printers []string `json:"printers"`
	Monitors []string `json:"monitors"`
}

// GetAIBenchmark gathers hardware info and calculates AI readiness.
func (a *App) GetAIBenchmark() AIBenchmark {
	b := AIBenchmark{}

	// Hostname
	if host, err := os.Hostname(); err == nil {
		b.Hostname = host
	} else {
		b.Hostname = "알 수 없음"
	}

	// IP Address
	b.IPAddress = getIPAddress()

	// MAC Address
	b.MACAddress = getMACAddress()

	// CPU
	b.CPUThreads = runtime.NumCPU()
	b.CPUCores = b.CPUThreads / 2
	if b.CPUCores < 1 {
		b.CPUCores = 1
	}
	b.CPUName = getCPUName()

	// RAM
	b.RAMTotalGB, b.RAMFreeGB = getRAMInfo()

	// GPU
	b.GPUName, b.GPUMemoryMB = getGPUInfo()

	// Disk
	b.DiskFreeGB = getDiskFreeGB()

	// Calculate scores
	// CPU score: based on thread count (4=low, 8=mid, 16+=high)
	switch {
	case b.CPUThreads >= 16:
		b.CPUScore = 100
	case b.CPUThreads >= 12:
		b.CPUScore = 85
	case b.CPUThreads >= 8:
		b.CPUScore = 70
	case b.CPUThreads >= 6:
		b.CPUScore = 50
	case b.CPUThreads >= 4:
		b.CPUScore = 30
	default:
		b.CPUScore = 10
	}

	// RAM score: need 8GB+ for small models, 16GB+ for medium
	switch {
	case b.RAMTotalGB >= 32:
		b.RAMScore = 100
	case b.RAMTotalGB >= 24:
		b.RAMScore = 85
	case b.RAMTotalGB >= 16:
		b.RAMScore = 70
	case b.RAMTotalGB >= 12:
		b.RAMScore = 50
	case b.RAMTotalGB >= 8:
		b.RAMScore = 30
	default:
		b.RAMScore = 10
	}

	// GPU score: dedicated GPU with VRAM is a big boost
	switch {
	case b.GPUMemoryMB >= 8000:
		b.GPUScore = 100
	case b.GPUMemoryMB >= 6000:
		b.GPUScore = 85
	case b.GPUMemoryMB >= 4000:
		b.GPUScore = 70
	case b.GPUMemoryMB >= 2000:
		b.GPUScore = 50
	case b.GPUMemoryMB > 0:
		b.GPUScore = 30
	default:
		b.GPUScore = 0 // integrated or unknown
	}

	// Disk score: need space for models (3GB~12GB+)
	switch {
	case b.DiskFreeGB >= 50:
		b.DiskScore = 100
	case b.DiskFreeGB >= 30:
		b.DiskScore = 80
	case b.DiskFreeGB >= 15:
		b.DiskScore = 60
	case b.DiskFreeGB >= 5:
		b.DiskScore = 30
	default:
		b.DiskScore = 10
	}

	// Overall grade (weighted: RAM 35%, GPU 30%, CPU 25%, Disk 10%)
	overall := float64(b.RAMScore)*0.35 + float64(b.GPUScore)*0.30 + float64(b.CPUScore)*0.25 + float64(b.DiskScore)*0.10

	switch {
	case overall >= 85:
		b.Grade = 1
		b.GradeLabel = "최상"
		b.GradeDesc = "대용량 모델(12B+)도 원활하게 실행 가능합니다."
		b.RecommModel = "gemma3:12b"
	case overall >= 70:
		b.Grade = 2
		b.GradeLabel = "우수"
		b.GradeDesc = "중형 모델(4B~8B)을 쾌적하게 사용할 수 있습니다."
		b.RecommModel = "gemma3:4b"
	case overall >= 55:
		b.Grade = 3
		b.GradeLabel = "양호"
		b.GradeDesc = "소형 모델(4B 이하)을 사용할 수 있습니다."
		b.RecommModel = "gemma3:4b"
	case overall >= 40:
		b.Grade = 4
		b.GradeLabel = "보통"
		b.GradeDesc = "경량 모델(3B 이하)만 사용 가능하며, 응답이 느릴 수 있습니다."
		b.RecommModel = "llama3.2:3b"
	case overall >= 25:
		b.Grade = 5
		b.GradeLabel = "부족"
		b.GradeDesc = "초경량 모델만 제한적으로 사용 가능합니다. RAM 확장을 권장합니다."
		b.RecommModel = "llama3.2:1b"
	default:
		b.Grade = 6
		b.GradeLabel = "부적합"
		b.GradeDesc = "현재 사양으로는 로컬 AI 실행이 어렵습니다."
		b.RecommModel = ""
	}

	// External Hardware
	b.Printers = getPrinterInfo()
	b.Monitors = getMonitorInfo()

	return b
}

// --- Hardware detection helpers ---

func getPrinterInfo() []string {
	encodedCmd := "WwBDAG8AbgBzAG8AbABlAF0AOgA6AE8AdQB0AHAAdQB0AEUAbgBjAG8AZABpAG4AZwAgAD0AIABbAFMAeQBzAHQAZQBtAC4AVABlAHgAdAAuAEUAbgBjAG8AZABpAG4AZwBdADoAOgBVAFQARgA4ADsAIAAKAAkARwBlAHQALQBDAGkAbQBJAG4AcwB0AGEAbgBjAGUAIABXAGkAbgAzADIAXwBQAHIAaQBuAHQAZQByACAAfAAgAAoACQBXAGgAZQByAGUALQBPAGIAagBlAGMAdAAgAHsAIAAkAF8ALgBOAGUAdAB3AG8AcgBrACAALQBvAHIAIAAkAF8ALgBMAG8AYwBhAGwAIAB9ACAAfAAgAAoACQBXAGgAZQByAGUALQBPAGIAagBlAGMAdAAgAHsAIAAkAF8ALgBOAGEAbQBlACAALQBuAG8AdABtAGEAdABjAGgAIAAnAFAARABGAHwATwBuAGUATgBvAHQAZQB8AFgAUABTAHwARgBhAHgAfABTAGUAbgBkACAAVABvAHwATQBpAGMAcgBvAHMAbwBmAHQAfABSAG8AbwB0AHwAUwBvAGYAdAB3AGEAcgBlACcAIAAtAGEAbgBkACAAJABfAC4ARAByAGkAdgBlAHIATgBhAG0AZQAgAC0AbgBvAHQAbQBhAHQAYwBoACAAJwBQAEQARgB8AE8AbgBlAE4AbwB0AGUAfABYAFAAUwB8AEYAYQB4AHwAUwBlAG4AZAAgAFQAbwB8AE0AaQBjAHIAbwBzAG8AZgB0AHwAUgBvAG8AdAB8AFMAbwBmAHQAdwBhAHIAZQAnACAAfQAgAHwAIAAKAAkARgBvAHIARQBhAGMAaAAtAE8AYgBqAGUAYwB0ACAAewAKAAkACQAkAG4AYQBtAGUAIAA9ACAAJABfAC4ATgBhAG0AZQAKAAkACQAkAGQAcgBpAHYAZQByACAAPQAgACQAXwAuAEQAcgBpAHYAZQByAE4AYQBtAGUACgAJAAkAaQBmACAAKABbAHMAdAByAGkAbgBnAF0AOgA6AEkAcwBOAHUAbABsAE8AcgBFAG0AcAB0AHkAKAAkAGQAcgBpAHYAZQByACkAIAAtAG8AcgAgACQAbgBhAG0AZQAgAC0AZQBxACAAJABkAHIAaQB2AGUAcgApACAAewAKAAkACQAJACQAbgBhAG0AZQAKAAkACQB9ACAAZQBsAHMAZQAgAHsACgAJAAkACQAkAGQAcgBpAHYAZQByAAoACQAJAH0ACgAJAH0AIAB8ACAAUwBlAGwAZQBjAHQALQBPAGIAagBlAGMAdAAgAC0AVQBuAGkAcQB1AGUA"
	out, err := exec.Command("powershell", "-NoProfile", "-EncodedCommand", encodedCmd).Output()
	if err != nil {
		return nil
	}
	return cleanOutput(out)
}

func getMonitorInfo() []string {
	encodedCmd := "WwBDAG8AbgBzAG8AbABlAF0AOgA6AE8AdQB0AHAAdQB0AEUAbgBjAG8AZABpAG4AZwAgAD0AIABbAFMAeQBzAHQAZQBtAC4AVABlAHgAdAAuAEUAbgBjAG8AZABpAG4AZwBdADoAOgBVAFQARgA4ADsACgAJACQAcgBlAHMAIAA9ACAAQAAoACkAOwAKAAkAdAByAHkAIAB7AAoACQAJACQAbQBvAG4AaQB0AG8AcgBzAEkAZAAgAD0AIABHAGUAdAAtAEMAaQBtAEkAbgBzAHQAYQBuAGMAZQAgAC0ATgBhAG0AZQBzAHAAYQBjAGUAIAByAG8AbwB0AFwAdwBtAGkAIAAtAEMAbABhAHMAcwBOAGEAbQBlACAAVwBtAGkATQBvAG4AaQB0AG8AcgBJAEQAIAAtAEUAcgByAG8AcgBBAGMAdABpAG8AbgAgAFMAaQBsAGUAbgB0AGwAeQBDAG8AbgB0AGkAbgB1AGUAOwAKAAkACQAkAG0AbwBuAGkAdABvAHIAcwBQAGEAcgBhAG0AcwAgAD0AIABHAGUAdAAtAEMAaQBtAEkAbgBzAHQAYQBuAGMAZQAgAC0ATgBhAG0AZQBzAHAAYQBjAGUAIAByAG8AbwB0AFwAdwBtAGkAIAAtAEMAbABhAHMAcwBOAGEAbQBlACAAVwBtAGkATQBvAG4AaQB0AG8AcgBCAGEAcwBpAGMARABpAHMAcABsAGEAeQBQAGEAcgBhAG0AcwAgAC0ARQByAHIAbwByAEEAYwB0AGkAbwBuACAAUwBpAGwAZQBuAHQAbAB5AEMAbwBuAHQAaQBuAHUAZQA7AAoACgAJAAkAaQBmACAAKAAkAG0AbwBuAGkAdABvAHIAcwBJAGQAIAAtAGkAcwBuAG8AdAAgAFsAYQByAHIAYQB5AF0AKQAgAHsAIAAkAG0AbwBuAGkAdABvAHIAcwBJAGQAIAA9ACAAQAAoACQAbQBvAG4AaQB0AG8AcgBzAEkAZAApACAAfQAKAAkACQBpAGYAIAAoACQAbQBvAG4AaQB0AG8AcgBzAFAAYQByAGEAbQBzACAALQBpAHMAbgBvAHQAIABbAGEAcgByAGEAeQBdACkAIAB7ACAAJABtAG8AbgBpAHQAbwByAHMAUABhAHIAYQBtAHMAIAA9ACAAQAAoACQAbQBvAG4AaQB0AG8AcgBzAFAAYQByAGEAbQBzACkAIAB9AAoACgAJAAkAZgBvAHIAZQBhAGMAaAAgACgAJABtACAAaQBuACAAJABtAG8AbgBpAHQAbwByAHMASQBkACkAIAB7AAoACQAJAAkAJABuAGEAbQBlACAAPQAgACIAIgA7AAoACQAJAAkAaQBmACAAKAAkAG0ALgBVAHMAZQByAEYAcgBpAGUAbgBkAGwAeQBOAGEAbQBlACAALQBuAGUAIAAkAG4AdQBsAGwAKQAgAHsACgAJAAkACQAJACQAbgBhAG0AZQBTAHQAcgAgAD0AIAAoACQAbQAuAFUAcwBlAHIARgByAGkAZQBuAGQAbAB5AE4AYQBtAGUAIAB8ACAAVwBoAGUAcgBlAC0ATwBiAGoAZQBjAHQAIAB7ACQAXwAgAC0AbgBlACAAMAB9ACAAfAAgAEYAbwByAEUAYQBjAGgALQBPAGIAagBlAGMAdAAgAHsAWwBjAGgAYQByAF0AJABfAH0AKQAgAC0AagBvAGkAbgAgACcAJwA7AAoACQAJAAkACQAkAG4AYQBtAGUAIAA9ACAAJABuAGEAbQBlAFMAdAByAC4AVAByAGkAbQAoACkAOwAKAAkACQAJAH0ACgAJAAkACQBpAGYAIAAoACQAbgBhAG0AZQAgAC0AZQBxACAAIgAiACkAIAB7ACAAJABuAGEAbQBlACAAPQAgACIAfMcYvCAAqLrIsjDRIgAgAH0ACgAKAAkACQAJACQAaQBuAGMAaABlAHMAIAA9ACAAMAA7AAoACQAJAAkAZgBvAHIAZQBhAGMAaAAgACgAJABwACAAaQBuACAAJABtAG8AbgBpAHQAbwByAHMAUABhAHIAYQBtAHMAKQAgAHsACgAJAAkACQAJAGkAZgAgACgAJABwAC4ASQBuAHMAdABhAG4AYwBlAE4AYQBtAGUAIAAtAGUAcQAgACQAbQAuAEkAbgBzAHQAYQBuAGMAZQBOAGEAbQBlACkAIAB7AAoACQAJAAkACQAJAGkAZgAgACgAJABwAC4ATQBhAHgASABvAHIAaQB6AG8AbgB0AGEAbABJAG0AYQBnAGUAUwBpAHoAZQAgAC0AZwB0ACAAMAApACAAewAKAAkACQAJAAkACQAJACQAZABpAGEAZwBDAG0AIAA9ACAAWwBNAGEAdABoAF0AOgA6AFMAcQByAHQAKABbAE0AYQB0AGgAXQA6ADoAUABvAHcAKAAkAHAALgBNAGEAeABIAG8AcgBpAHoAbwBuAHQAYQBsAEkAbQBhAGcAZQBTAGkAegBlACwAIAAyACkAIAArACAAWwBNAGEAdABoAF0AOgA6AFAAbwB3ACgAJABwAC4ATQBhAHgAVgBlAHIAdABpAGMAYQBsAEkAbQBhAGcAZQBTAGkAegBlACwAIAAyACkAKQA7AAoACQAJAAkACQAJAAkAJABpAG4AYwBoAGUAcwAgAD0AIABbAE0AYQB0AGgAXQA6ADoAUgBvAHUAbgBkACgAJABkAGkAYQBnAEMAbQAgAC8AIAAyAC4ANQA0ACwAIAAwACkAOwAKAAkACQAJAAkACQB9AAoACQAJAAkACQAJAGIAcgBlAGEAawA7AAoACQAJAAkACQB9AAoACQAJAAkAfQAKAAoACQAJAAkAaQBmACAAKAAkAGkAbgBjAGgAZQBzACAALQBnAHQAIAAwACkAIAB7AAoACQAJAAkACQAkAHIAZQBzACAAKwA9ACAAIgAkAG4AYQBtAGUAIAAoACQAKAAkAGkAbgBjAGgAZQBzACkAeMdYzikAIgA7AAoACQAJAAkAfQAgAGUAbABzAGUAIAB7AAoACQAJAAkACQAkAHIAZQBzACAAKwA9ACAAJABuAGEAbQBlADsACgAJAAkACQB9AAoACQAJAH0ACgAJAH0AIABjAGEAdABjAGgAIAB7AH0ACgAKAAkAaQBmACAAKAAkAHIAZQBzAC4AQwBvAHUAbgB0ACAALQBnAHQAIAAwACkAIAB7AAoACQAJACQAcgBlAHMAOwAKAAkAfQAgAGUAbABzAGUAIAB7AAoACQAJAEcAZQB0AC0AQwBpAG0ASQBuAHMAdABhAG4AYwBlACAAVwBpAG4AMwAyAF8ARABlAHMAawB0AG8AcABNAG8AbgBpAHQAbwByACAAfAAgAFMAZQBsAGUAYwB0AC0ATwBiAGoAZQBjAHQAIAAtAEUAeABwAGEAbgBkAFAAcgBvAHAAZQByAHQAeQAgAE4AYQBtAGUAOwAKAAkAfQA="
	out, err := exec.Command("powershell", "-NoProfile", "-EncodedCommand", encodedCmd).Output()
	if err != nil {
		return nil
	}
	return cleanOutput(out)
}

func cleanOutput(out []byte) []string {
	var list []string
	lines := strings.Split(strings.ReplaceAll(string(out), "\r\n", "\n"), "\n")
	for _, line := range lines {
		name := strings.TrimSpace(line)
		if name != "" && name != "Name" {
			list = append(list, name)
		}
	}
	return list
}

func getCPUName() string {
	out, err := exec.Command("wmic", "cpu", "get", "Name", "/value").Output()
	if err != nil {
		return fmt.Sprintf("%d-Thread CPU", runtime.NumCPU())
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Name=") {
			return strings.TrimPrefix(line, "Name=")
		}
	}
	return fmt.Sprintf("%d-Thread CPU", runtime.NumCPU())
}

func getRAMInfo() (totalGB, freeGB float64) {
	out, err := exec.Command("wmic", "os", "get", "TotalVisibleMemorySize,FreePhysicalMemory", "/value").Output()
	if err != nil {
		return 0, 0
	}
	var totalKB, freeKB float64
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "TotalVisibleMemorySize=") {
			fmt.Sscanf(strings.TrimPrefix(line, "TotalVisibleMemorySize="), "%f", &totalKB)
		}
		if strings.HasPrefix(line, "FreePhysicalMemory=") {
			fmt.Sscanf(strings.TrimPrefix(line, "FreePhysicalMemory="), "%f", &freeKB)
		}
	}
	return totalKB / (1024 * 1024), freeKB / (1024 * 1024)
}

func getGPUInfo() (name string, memoryMB int) {
	out, err := exec.Command("wmic", "path", "win32_videocontroller", "get", "Name,AdapterRAM", "/value").Output()
	if err != nil {
		return "알 수 없음", 0
	}

	var bestName string
	var bestMem int

	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Name=") {
			bestName = strings.TrimPrefix(line, "Name=")
		}
		if strings.HasPrefix(line, "AdapterRAM=") {
			var ram int64
			fmt.Sscanf(strings.TrimPrefix(line, "AdapterRAM="), "%d", &ram)
			mb := int(ram / (1024 * 1024))
			if mb > bestMem {
				bestMem = mb
			}
		}
	}

	if bestName == "" {
		bestName = "알 수 없음"
	}
	return bestName, bestMem
}

func getDiskFreeGB() float64 {
	out, err := exec.Command("wmic", "logicaldisk", "where", "DeviceID='C:'", "get", "FreeSpace", "/value").Output()
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "FreeSpace=") {
			var freeBytes float64
			fmt.Sscanf(strings.TrimPrefix(line, "FreeSpace="), "%f", &freeBytes)
			return freeBytes / (1024 * 1024 * 1024)
		}
	}
	return 0
}

func getMACAddress() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "알 수 없음"
	}
	for _, inter := range interfaces {
		if inter.HardwareAddr.String() != "" {
			return inter.HardwareAddr.String()
		}
	}
	return "알 수 없음"
}

func getIPAddress() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "알 수 없음"
	}
	for _, address := range addrs {
		// check the address type and if it is not a loopback the display it
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "알 수 없음"
}

// GetFileDataURL fetches a file from the server and returns it as a data URL for rendering in the UI.
func (a *App) GetFileDataURL(fileID string) string {
	req, err := http.NewRequest("GET", a.apiBase+"/api/core/files/"+fileID, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+a.authToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return ""
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data)
}

// DownloadFileResult is the result of a file download operation.
type DownloadFileResult struct {
	Success  bool   `json:"success"`
	FilePath string `json:"file_path,omitempty"`
	Error    string `json:"error,omitempty"`
}

// DownloadFile downloads a file from the API server and saves it via native dialog.
func (a *App) DownloadFile(fileID, fileName string) DownloadFileResult {
	// Fetch file from server
	req, err := http.NewRequest("GET", a.apiBase+"/api/core/files/"+fileID, nil)
	if err != nil {
		return DownloadFileResult{Success: false, Error: "요청 생성 실패"}
	}
	req.Header.Set("Authorization", "Bearer "+a.authToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return DownloadFileResult{Success: false, Error: "서버에 연결할 수 없습니다"}
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return DownloadFileResult{Success: false, Error: fmt.Sprintf("다운로드 실패 (%d)", resp.StatusCode)}
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return DownloadFileResult{Success: false, Error: "파일 읽기 실패"}
	}

	// Show native save dialog
	ext := filepath.Ext(fileName)
	savePath, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		DefaultFilename: fileName,
		Title:           "파일 저장",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "파일 (*" + ext + ")", Pattern: "*" + ext},
			{DisplayName: "모든 파일 (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return DownloadFileResult{Success: false, Error: "저장 다이얼로그 오류"}
	}
	if savePath == "" {
		// User cancelled
		return DownloadFileResult{Success: false, Error: ""}
	}

	if err := os.WriteFile(savePath, data, 0644); err != nil {
		return DownloadFileResult{Success: false, Error: "파일 저장 실패: " + err.Error()}
	}

	return DownloadFileResult{Success: true, FilePath: savePath}
}

// SaveFileBytes saves base64 encoded data to a file via a native save dialog.
func (a *App) SaveFileBytes(fileName string, base64Data string) DownloadFileResult {
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return DownloadFileResult{Success: false, Error: "데이터 디코딩 실패"}
	}

	ext := filepath.Ext(fileName)
	savePath, err := wailsRuntime.SaveFileDialog(a.ctx, wailsRuntime.SaveDialogOptions{
		DefaultFilename: fileName,
		Title:           "파일 저장",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "파일 (*" + ext + ")", Pattern: "*" + ext},
			{DisplayName: "모든 파일 (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return DownloadFileResult{Success: false, Error: "저장 다이얼로그 오류"}
	}
	if savePath == "" {
		// User cancelled
		return DownloadFileResult{Success: false, Error: ""}
	}

	if err := os.WriteFile(savePath, data, 0644); err != nil {
		return DownloadFileResult{Success: false, Error: "파일 저장 실패: " + err.Error()}
	}

	return DownloadFileResult{Success: true, FilePath: savePath}
}

// UploadFileResult is the result of a file upload operation.
type UploadFileResult struct {
	ID          string `json:"id"`
	FileName    string `json:"file_name"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	URL         string `json:"url,omitempty"`
	Error       string `json:"error,omitempty"`
}

// uploadFileToServer uploads a file to the API server and returns the file record.
func (a *App) uploadFileToServer(filePath string) UploadFileResult {
	f, err := os.Open(filePath)
	if err != nil {
		return UploadFileResult{Error: "파일을 열 수 없습니다: " + err.Error()}
	}
	defer f.Close()

	// Check file size
	stat, err := f.Stat()
	if err != nil {
		return UploadFileResult{Error: "파일 정보를 읽을 수 없습니다"}
	}
	const maxFileSize = 1024 * 1024 * 1024 // 1GB
	if stat.Size() > maxFileSize {
		return UploadFileResult{Error: fmt.Sprintf("허용 용량(1GB)을 초과했습니다. (파일 크기: %dMB)", stat.Size()/(1024*1024))}
	}

	fileName := filepath.Base(filePath)

	// Stream multipart form via pipe to avoid loading entire file in memory
	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)

	go func() {
		defer pw.Close()
		part, err := writer.CreateFormFile("file", fileName)
		if err != nil {
			pw.CloseWithError(err)
			return
		}
		if _, err := io.Copy(part, f); err != nil {
			pw.CloseWithError(err)
			return
		}
		writer.WriteField("plugin_id", "messenger")
		writer.WriteField("storage", "auto")
		writer.Close()
	}()

	req, err := http.NewRequest("POST", a.apiBase+"/api/core/files/upload", pr)
	if err != nil {
		return UploadFileResult{Error: "요청 생성 실패"}
	}
	req.Header.Set("Authorization", "Bearer "+a.authToken)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := httpClient.Do(req)
	if err != nil {
		return UploadFileResult{Error: "서버에 연결할 수 없습니다"}
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 201 {
		return UploadFileResult{Error: fmt.Sprintf("업로드 실패 (%d): %s", resp.StatusCode, string(data))}
	}

	var record UploadFileResult
	if err := json.Unmarshal(data, &record); err != nil {
		return UploadFileResult{Error: "응답 파싱 실패"}
	}
	if record.ID != "" {
		record.URL = a.apiBase + "/api/core/files/" + record.ID
	}
	return record
}

// SelectAndUploadFiles opens a native file picker and uploads selected files.
func (a *App) SelectAndUploadFiles() []UploadFileResult {
	paths, err := wailsRuntime.OpenMultipleFilesDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "파일 선택",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "모든 파일 (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil || len(paths) == 0 {
		return nil
	}

	var results []UploadFileResult
	for _, p := range paths {
		results = append(results, a.uploadFileToServer(p))
	}
	return results
}

// UploadFileFromBytes uploads a file from raw bytes (for drag & drop from frontend).
func (a *App) UploadFileFromBytes(fileName string, base64Data string) UploadFileResult {
	fileData, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return UploadFileResult{Error: "데이터 디코딩 실패"}
	}

	const maxFileSize = 1024 * 1024 * 1024 // 1GB
	if len(fileData) > maxFileSize {
		return UploadFileResult{Error: fmt.Sprintf("허용 용량(1GB)을 초과했습니다. (파일 크기: %dMB)", len(fileData)/(1024*1024))}
	}

	// Build multipart form
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return UploadFileResult{Error: "폼 생성 실패"}
	}
	if _, err := part.Write(fileData); err != nil {
		return UploadFileResult{Error: "데이터 쓰기 실패"}
	}
	writer.WriteField("plugin_id", "messenger")
	writer.WriteField("storage", "auto")
	writer.Close()

	req, err := http.NewRequest("POST", a.apiBase+"/api/core/files/upload", &buf)
	if err != nil {
		return UploadFileResult{Error: "요청 생성 실패"}
	}
	req.Header.Set("Authorization", "Bearer "+a.authToken)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := httpClient.Do(req)
	if err != nil {
		return UploadFileResult{Error: "서버에 연결할 수 없습니다"}
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 201 {
		return UploadFileResult{Error: fmt.Sprintf("업로드 실패 (%d): %s", resp.StatusCode, string(data))}
	}

	var record UploadFileResult
	if err := json.Unmarshal(data, &record); err != nil {
		return UploadFileResult{Error: "응답 파싱 실패"}
	}
	if record.ID != "" {
		record.URL = a.apiBase + "/api/core/files/" + record.ID
	}
	return record
}

// SelectAndUploadDoc opens a native file picker, converts HWP to PDF if needed, and uploads the result to the server.
func (a *App) SelectAndUploadDoc() UploadFileResult {
	// 1. Pick File from local disk
	filePath, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "전자문서/서명용 파일 선택",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "문서 파일 (*.hwp, *.hwpx, *.pdf)", Pattern: "*.hwp;*.hwpx;*.pdf"},
		},
	})
	if err != nil || filePath == "" {
		return UploadFileResult{Error: "파일 선택이 취소되었습니다"}
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	originalFileName := filepath.Base(filePath)
	finalUploadPath := filePath
	uploadFileName := originalFileName

	// 2. If it's HWP, convert to PDF first
	if ext == ".hwp" || ext == ".hwpx" {
		tmpDir, _ := os.MkdirTemp("", "sendoc_upload_")
		// We don't defer remove here because uploadFileToServer needs to read it.
		// We can clean up after upload.

		pdfName := strings.TrimSuffix(originalFileName, ext) + ".pdf"
		outPath := filepath.Join(tmpDir, pdfName)

		respChan := make(chan error, 1)
		a.hwpTaskChan <- hwpTask{
			inputPath:  filePath,
			outputPath: outPath,
			outputType: "pdf",
			respChan:   respChan,
		}

		select {
		case err := <-respChan:
			if err != nil {
				os.RemoveAll(tmpDir)
				return UploadFileResult{Error: "HWP 변환 실패: " + err.Error()}
			}
			finalUploadPath = outPath
			uploadFileName = pdfName
			defer os.RemoveAll(tmpDir) // Clean up tmp PDF after function returns
		case <-time.After(60 * time.Second):
			os.RemoveAll(tmpDir)
			return UploadFileResult{Error: "변환 시간 초과"}
		}
	}

	// 3. Upload the final file (original PDF or converted PDF) to the server
	// This calls the internal uploadFileToServer which sends it to :5200/api/core/files/upload
	result := a.uploadFileToServer(finalUploadPath)

	// Ensure the returned filename matches what we actually uploaded
	if result.Error == "" {
		// Log success for debugging
		fmt.Printf("[Sendoc] Successfully uploaded %s to server\n", uploadFileName)
	}

	return result
}

// --- Ollama Management ---

// OllamaStatus represents the current state of Ollama.
type OllamaStatus struct {
	Installed bool   `json:"installed"`
	Running   bool   `json:"running"`
	Path      string `json:"path,omitempty"`
	Error     string `json:"error,omitempty"`
}

// CheckOllama checks if Ollama is installed and running.
func (a *App) CheckOllama() OllamaStatus {
	status := OllamaStatus{}

	path, err := exec.LookPath("ollama")
	if err != nil {
		commonPath := filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Ollama", "ollama.exe")
		if _, statErr := os.Stat(commonPath); statErr == nil {
			path = commonPath
		} else {
			status.Installed = false
			return status
		}
	}
	status.Installed = true
	status.Path = path

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://localhost:11434/api/tags")
	if err != nil {
		status.Running = false
		return status
	}
	defer resp.Body.Close()
	status.Running = resp.StatusCode == 200
	return status
}

// InstallOllama downloads and installs Ollama using winget.
func (a *App) InstallOllama() OllamaStatus {
	if _, err := exec.LookPath("ollama"); err == nil {
		return OllamaStatus{Installed: true, Error: "이미 설치되어 있습니다"}
	}

	cmd := exec.Command("winget", "install", "--id", "Ollama.Ollama", "--accept-source-agreements", "--accept-package-agreements", "--silent")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return OllamaStatus{Installed: false, Error: fmt.Sprintf("설치 실패: %s\n%s", err.Error(), string(output))}
	}

	path, err := exec.LookPath("ollama")
	if err != nil {
		commonPath := filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Ollama", "ollama.exe")
		if _, statErr := os.Stat(commonPath); statErr == nil {
			return OllamaStatus{Installed: true, Path: commonPath}
		}
		return OllamaStatus{Installed: false, Error: "설치 완료. 앱을 재시작해주세요."}
	}
	return OllamaStatus{Installed: true, Path: path}
}

// StartOllama starts the Ollama server process.
func (a *App) StartOllama() OllamaStatus {
	client := &http.Client{Timeout: 3 * time.Second}
	if resp, err := client.Get("http://localhost:11434/api/tags"); err == nil {
		resp.Body.Close()
		if resp.StatusCode == 200 {
			return OllamaStatus{Installed: true, Running: true}
		}
	}

	ollamaPath, err := exec.LookPath("ollama")
	if err != nil {
		commonPath := filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Ollama", "ollama.exe")
		if _, statErr := os.Stat(commonPath); statErr == nil {
			ollamaPath = commonPath
		} else {
			return OllamaStatus{Installed: false, Error: "Ollama가 설치되어 있지 않습니다"}
		}
	}

	cmd := exec.Command(ollamaPath, "serve")
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return OllamaStatus{Installed: true, Running: false, Error: "Ollama 시작 실패: " + err.Error()}
	}

	for i := 0; i < 30; i++ {
		time.Sleep(500 * time.Millisecond)
		if resp, err := client.Get("http://localhost:11434/api/tags"); err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return OllamaStatus{Installed: true, Running: true, Path: ollamaPath}
			}
		}
	}
	return OllamaStatus{Installed: true, Running: false, Error: "Ollama가 시작되었지만 응답하지 않습니다"}
}

// StopOllama stops the running Ollama server process.
func (a *App) StopOllama() OllamaStatus {
	exec.Command("taskkill", "/F", "/IM", "ollama.exe", "/T").Run()
	// Give it a moment then verify
	time.Sleep(500 * time.Millisecond)
	client := &http.Client{Timeout: 2 * time.Second}
	if _, err := client.Get("http://localhost:11434/api/tags"); err != nil {
		return OllamaStatus{Installed: true, Running: false}
	}
	return OllamaStatus{Installed: true, Running: true, Error: "Ollama 중지에 실패했습니다"}
}

// GenerateAIStream starts an AI generation from Ollama and emits chunks via Wails events:
//   - "ai:chunk"  — content string fragment
//   - "ai:done"   — generation finished (empty string)
//   - "ai:error"  — error message string
//
// The request body is the standard Ollama /api/chat JSON payload.
func (a *App) GenerateAIStream(model, systemPrompt, userMsg string) {
	// Cancel any in-progress generation
	if a.aiCancel != nil {
		a.aiCancel()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	a.aiCancel = cancel

	go func() {
		defer func() {
			cancel()
			a.aiCancel = nil
		}()

		reqBody := map[string]interface{}{
			"model": model,
			"messages": []map[string]string{
				{"role": "system", "content": systemPrompt},
				{"role": "user", "content": userMsg},
			},
			"stream": true,
			"options": map[string]interface{}{
				"num_ctx":     4096,
				"num_predict": 2048,
				"temperature": 0.6,
				"top_k":       20,
				"top_p":       0.5,
			},
		}
		bodyBytes, err := json.Marshal(reqBody)
		if err != nil {
			wailsRuntime.EventsEmit(a.ctx, "ai:error", "요청 직렬화 실패: "+err.Error())
			return
		}

		req, err := http.NewRequestWithContext(ctx, "POST", "http://localhost:11434/api/chat", bytes.NewReader(bodyBytes))
		if err != nil {
			wailsRuntime.EventsEmit(a.ctx, "ai:error", "요청 생성 실패: "+err.Error())
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := (&http.Client{}).Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return // cancelled by user
			}
			wailsRuntime.EventsEmit(a.ctx, "ai:error", "Ollama 서버에 연결할 수 없습니다 (localhost:11434). Ollama가 실행 중인지 확인해주세요.")
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			errMsg := string(body)

			// Try to parse standard Ollama {"error": "..."} JSON
			var errResp struct {
				Error string `json:"error"`
			}
			if err := json.Unmarshal(body, &errResp); err == nil && errResp.Error != "" {
				errMsg = errResp.Error
			}

			if strings.Contains(errMsg, "requires more system memory") || strings.Contains(errMsg, "out of memory") {
				errMsg = "컴퓨터의 메모리(RAM)가 부족하여 선택한 AI 모델을 실행할 수 없습니다. 더 작고 가벼운 모델(예: EXAONE, Gemma)을 사용해 보시거나 안 쓰는 프로그램을 종료해 주세요."
			}

			wailsRuntime.EventsEmit(a.ctx, "ai:error", fmt.Sprintf("Ollama 연결 오류 (%d): %s", resp.StatusCode, errMsg))
			return
		}

		decoder := json.NewDecoder(resp.Body)
		for {
			if ctx.Err() != nil {
				return // cancelled
			}
			var chunk map[string]interface{}
			if err := decoder.Decode(&chunk); err != nil {
				break
			}
			if msg, ok := chunk["message"].(map[string]interface{}); ok {
				if content, ok := msg["content"].(string); ok && content != "" {
					wailsRuntime.EventsEmit(a.ctx, "ai:chunk", content)
				}
			}
		}
		wailsRuntime.EventsEmit(a.ctx, "ai:done", "")
	}()
}

// CancelAIGenerate cancels the current AI generation stream.
func (a *App) CancelAIGenerate() {
	if a.aiCancel != nil {
		a.aiCancel()
		a.aiCancel = nil
	}
}

// ExtractKeywordsLocalAI uses Ollama to extract core noun keywords from a natural language query.
func (a *App) ExtractKeywordsLocalAI(query string) string {
	models := a.GetLocalModels()
	if len(models) == 0 {
		return query
	}
	model := models[0]
	for _, m := range models {
		if strings.Contains(m, "gemma") {
			model = m
			break
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	systemPrompt := "다음 문장에서 검색에 사용될 핵심 명사 단어 2~3개만 추출해. 오직 띄어쓰기로 구분된 단어들만 출력해. 부가 설명 금지."

	reqBody := map[string]interface{}{
		"model":  model,
		"prompt": systemPrompt + "\n문장: " + query,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.1,
		},
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", "http://localhost:11434/api/generate", bytes.NewReader(bodyBytes))
	if err != nil {
		return query
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{}).Do(req)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return query
	}
	defer resp.Body.Close()

	var result struct {
		Response string `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return query
	}

	extracted := strings.TrimSpace(result.Response)
	if extracted == "" || len(extracted) > 50 {
		return query
	}
	extracted = strings.ReplaceAll(extracted, `"`, "")
	extracted = strings.ReplaceAll(extracted, `'`, "")
	extracted = strings.ReplaceAll(extracted, `,`, " ")
	return extracted
}

// GetLocalModels returns a list of installed models directly from local Ollama avoiding CORS.
func (a *App) GetLocalModels() []string {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://localhost:11434/api/tags")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var data struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	var names []string
	for _, m := range data.Models {
		names = append(names, m.Name)
	}
	return names
}

// PullModelResult is the result of a model pull operation.
type PullModelResult struct {
	Success bool   `json:"success"`
	Model   string `json:"model"`
	Error   string `json:"error,omitempty"`
}

// PullModel downloads a model via Ollama CLI.
func (a *App) PullModel(modelName string) PullModelResult {
	ollamaPath, err := exec.LookPath("ollama")
	if err != nil {
		commonPath := filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Ollama", "ollama.exe")
		if _, statErr := os.Stat(commonPath); statErr == nil {
			ollamaPath = commonPath
		} else {
			return PullModelResult{Error: "Ollama가 설치되어 있지 않습니다"}
		}
	}

	cmd := exec.Command(ollamaPath, "pull", modelName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return PullModelResult{Error: fmt.Sprintf("모델 다운로드 실패: %s\n%s", err.Error(), string(output))}
	}
	return PullModelResult{Success: true, Model: modelName}
}
