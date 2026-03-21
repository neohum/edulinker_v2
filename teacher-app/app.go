package main

import (
	"bytes"
	"context"
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

	"github.com/go-ole/go-ole"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// httpClient with generous timeout for large file uploads.
var httpClient = &http.Client{
	Timeout: 30 * time.Minute,
}

// App struct holds the application state and context.
type App struct {
	ctx            context.Context
	apiBase        string
	authToken      string
	hwpMutex       sync.Mutex
	hwpObject      *ole.IDispatch
	hwpTaskChan    chan hwpTask
	hwpWorkerOnce  sync.Once
	hancomStatus   map[string]interface{} // cached on startup
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
}

// Register registers a new user with the API server and signs them in.
func (a *App) Register(schoolCode, schoolName, name, phone, password, role, classPhone string) LoginResult {
	body := fmt.Sprintf(`{"school_code":"%s","school_name":"%s","name":"%s","phone":"%s","password":"%s","role":"%s","class_phone":"%s"}`, schoolCode, schoolName, name, phone, password, role, classPhone)
	resp, err := http.Post(a.apiBase+"/api/auth/register", "application/json", strings.NewReader(body))
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
	resp, err := http.Post(a.apiBase+"/api/auth/login", "application/json", strings.NewReader(body))
	if err != nil {
		return LoginResult{Success: false, Error: "서버에 연결할 수 없습니다"}
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		var errResp map[string]string
		json.Unmarshal(data, &errResp)
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
	IPAddress  string `json:"ip_address"`
	CPUName    string `json:"cpu_name"`
	CPUCores   int    `json:"cpu_cores"`
	CPUThreads int    `json:"cpu_threads"`
	RAMTotalGB float64 `json:"ram_total_gb"`
	RAMFreeGB  float64 `json:"ram_free_gb"`
	GPUName    string `json:"gpu_name"`
	GPUMemoryMB int   `json:"gpu_memory_mb"`
	DiskFreeGB float64 `json:"disk_free_gb"`
	MACAddress string  `json:"mac_address"`

	// Scores (0-100)
	CPUScore  int `json:"cpu_score"`
	RAMScore  int `json:"ram_score"`
	GPUScore  int `json:"gpu_score"`
	DiskScore int `json:"disk_score"`

	// Overall: 1~6 grade
	Grade       int    `json:"grade"`       // 1=최상 ~ 6=부적합
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
	// Force UTF-8 output and get clear printer product names, filtering virtual ones
	psCmd := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Printer | Where-Object { $_.Network -or $_.Local } | Where-Object { $_.Name -notmatch 'PDF|OneNote|XPS|Fax|Send To|Microsoft|Root' } | Select-Object -ExpandProperty Name`
	out, err := exec.Command("powershell", "-NoProfile", "-Command", psCmd).Output()
	if err != nil {
		return nil
	}
	return cleanOutput(out)
}

func getMonitorInfo() []string {
	// Calculate monitor size in inches using physical dimensions from EDID
	psCmd := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; 
	$monitors = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams;
	foreach ($m in $monitors) {
		$diagCm = [Math]::Sqrt([Math]::Pow($m.MaxHorizontalImageSize, 2) + [Math]::Pow($m.MaxVerticalImageSize, 2));
		$inches = [Math]::Round($diagCm / 2.54, 0);
		if ($inches -gt 0) { "$inches인치 모니터" }
	}`
	out, err := exec.Command("powershell", "-NoProfile", "-Command", psCmd).Output()
	if err != nil {
		return nil
	}
	list := cleanOutput(out)
	
	if len(list) == 0 {
		// Fallback to basic monitor name if size calculation fails
		psCmdRes := `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_DesktopMonitor | Select-Object -ExpandProperty Name`
		outRes, _ := exec.Command("powershell", "-NoProfile", "-Command", psCmdRes).Output()
		list = cleanOutput(outRes)
	}
	return list
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

// SetAPIBase allows changing the API server URL.
func (a *App) SetAPIBase(url string) {
	a.apiBase = url
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
