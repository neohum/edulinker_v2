package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx        context.Context
	serverCmd  *exec.Cmd
	serverLock sync.Mutex
	logs       []string
	logLimit   int
	isRunning  bool
	isStarting bool
	startTime  time.Time
	backendDir string // cached on startup
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		logs:     make([]string, 0),
		logLimit: 1000,
	}
}

// startup is called when the app starts. Must return quickly.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Cache backend directory path
	a.backendDir = findBackendDir()

	// Kill orphan processes asynchronously so we don't block app startup
	go func() {
		killPort5200()
	}()
}

// killPort5200 kills any process occupying port 5200 concurrently
func killPort5200() {
	if runtime.GOOS == "windows" {
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			exec.Command("taskkill", "/F", "/IM", "api-server.exe").Run()
		}()
		go func() {
			defer wg.Done()
			// Find and kill by port using native Go parsing to avoid cmd quote issues
			out, err := exec.Command("netstat", "-ano", "-p", "tcp").Output()
			if err == nil {
				scanner := bufio.NewScanner(bytes.NewReader(out))
				for scanner.Scan() {
					line := scanner.Text()
					if strings.Contains(line, ":5200") && strings.Contains(line, "LISTENING") {
						fields := strings.Fields(line)
						if len(fields) >= 5 {
							pid := fields[len(fields)-1]
							exec.Command("taskkill", "/F", "/PID", pid).Run()
						}
					}
				}
			}
		}()
		wg.Wait()
	}
}

// waitForPortCleared actively checks if port 5200 is free, returning instantly when free.
func waitForPortCleared() {
	for i := 0; i < 20; i++ { // max 1 second
		conn, err := net.DialTimeout("tcp", "127.0.0.1:5200", 20*time.Millisecond)
		if err != nil {
			// Port is free (connection refused)
			return
		}
		if conn != nil {
			conn.Close()
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// emitLog appends to internal log buffer and pushes to frontend
func (a *App) emitLog(msg string) {
	a.serverLock.Lock()
	a.logs = append(a.logs, msg)
	if len(a.logs) > a.logLimit {
		a.logs = a.logs[1:]
	}
	a.serverLock.Unlock()

	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, "server-log", msg)
	}
}

// ServerStatus represents the current state of the backend
type ServerStatus struct {
	IsRunning bool   `json:"isRunning"`
	Uptime    string `json:"uptime"`
}

// GetStatus returns whether the server is running
func (a *App) GetStatus() ServerStatus {
	a.serverLock.Lock()
	defer a.serverLock.Unlock()

	status := ServerStatus{
		IsRunning: a.isRunning,
	}

	if a.isRunning {
		status.Uptime = time.Since(a.startTime).Round(time.Second).String()
	} else {
		status.Uptime = "0s"
	}

	return status
}

// findBackendDir searches upward from cwd to locate the backend/ directory.
func findBackendDir() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}

	for i := 0; i < 4; i++ {
		tryPath := filepath.Join(dir, "backend")
		if stat, err := os.Stat(tryPath); err == nil && stat.IsDir() {
			return tryPath
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// StartServer builds and starts the edulinker API server.
// The build + start happens in a goroutine so the Wails IPC call returns immediately.
func (a *App) StartServer() error {
	a.serverLock.Lock()
	if a.isRunning {
		a.serverLock.Unlock()
		return nil
	}
	if a.isStarting {
		a.serverLock.Unlock()
		return nil
	}
	a.isStarting = true
	a.serverLock.Unlock()

	if a.backendDir == "" {
		a.serverLock.Lock()
		a.isStarting = false
		a.serverLock.Unlock()
		return fmt.Errorf("backend directory not found")
	}

	// Reset logs
	a.serverLock.Lock()
	a.logs = []string{}
	a.serverLock.Unlock()

	// Run entire build+start flow in background so IPC doesn't block
	go a.buildAndStart()

	return nil
}

func (a *App) buildAndStart() {
	defer func() {
		a.serverLock.Lock()
		a.isStarting = false
		a.serverLock.Unlock()
	}()

	// Step 0: Kill anything on port 5200
	a.emitLog("🧹 [DASHBOARD] 기존 프로세스 정리 중...")
	killPort5200()
	waitForPortCleared()

	// Step 1: Build
	a.emitLog("🔨 [DASHBOARD] 백엔드 빌드 중... (첫 실행 시 시간이 걸릴 수 있습니다)")

	exePath := filepath.Join(a.backendDir, "api-server.exe")
	buildCmd := exec.Command("go", "build", "-o", exePath, "./cmd/api-server/")
	buildCmd.Dir = a.backendDir
	hiddenProcAttr(buildCmd)

	buildOut, buildErr := buildCmd.CombinedOutput()
	if buildErr != nil {
		a.emitLog(fmt.Sprintf("❌ [DASHBOARD] 빌드 실패: %v\n%s", buildErr, string(buildOut)))
		return
	}
	a.emitLog("✅ [DASHBOARD] 빌드 성공. 서버를 시작합니다...")

	// Step 2: Run
	cmd := exec.Command(exePath)
	cmd.Dir = a.backendDir
	hiddenProcAttr(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		a.emitLog(fmt.Sprintf("❌ [DASHBOARD] stdout 파이프 실패: %v", err))
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		a.emitLog(fmt.Sprintf("❌ [DASHBOARD] stderr 파이프 실패: %v", err))
		return
	}

	if err := cmd.Start(); err != nil {
		a.emitLog(fmt.Sprintf("❌ [DASHBOARD] 서버 실행 실패: %v", err))
		return
	}

	a.serverLock.Lock()
	a.serverCmd = cmd
	a.isRunning = true
	a.startTime = time.Now()
	a.serverLock.Unlock()

	a.emitLog("🚀 [DASHBOARD] 서버 프로세스가 시작되었습니다 (PID: " + fmt.Sprintf("%d", cmd.Process.Pid) + ")")

	// Stream stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			a.emitLog(scanner.Text())
		}
	}()

	// Stream stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			a.emitLog("[STDERR] " + scanner.Text())
		}
	}()

	// Wait for process exit
	go func() {
		processErr := cmd.Wait()
		if processErr != nil {
			a.emitLog(fmt.Sprintf("❌ [DASHBOARD] 서버 프로세스가 종료되었습니다: %v", processErr))
		} else {
			a.emitLog("🛑 [DASHBOARD] 서버 프로세스가 정상 종료되었습니다.")
		}

		a.serverLock.Lock()
		if a.serverCmd == cmd {
			a.isRunning = false
			a.serverCmd = nil
		}
		a.serverLock.Unlock()

		if a.ctx != nil {
			wailsRuntime.EventsEmit(a.ctx, "server-stopped")
		}
	}()
}

// StopServer kills the API server
func (a *App) StopServer() error {
	a.serverLock.Lock()
	cmd := a.serverCmd
	a.serverLock.Unlock()

	// Try killing by PID first if we have a process handle
	if cmd != nil && cmd.Process != nil {
		pid := cmd.Process.Pid
		exec.Command("taskkill", "/T", "/F", "/PID", fmt.Sprintf("%d", pid)).Run()
	}

	// Also kill by name and port as fallback
	killPort5200()

	time.Sleep(300 * time.Millisecond)

	a.serverLock.Lock()
	a.isRunning = false
	a.serverCmd = nil
	a.serverLock.Unlock()

	a.emitLog("🛑 [DASHBOARD] 서버를 중지했습니다.")
	return nil
}

// GetLogs returns the current buffered logs
func (a *App) GetLogs() []string {
	a.serverLock.Lock()
	defer a.serverLock.Unlock()

	logsCopy := make([]string, len(a.logs))
	copy(logsCopy, a.logs)
	return logsCopy
}

// ClearLogs empties the log buffer
func (a *App) ClearLogs() {
	a.serverLock.Lock()
	defer a.serverLock.Unlock()
	a.logs = []string{}
}

// DependencyStatus represents the status of required infrastructure
type DependencyStatus struct {
	Postgres bool `json:"postgres"`
	Redis    bool `json:"redis"`
	Minio    bool `json:"minio"`
}

// CheckDependencies dials ports to check if infrastructure is active
func (a *App) CheckDependencies() DependencyStatus {
	return DependencyStatus{
		Postgres: checkPort("5432"),
		Redis:    checkPort("6379"),
		Minio:    checkPort("9000"),
	}
}

func checkPort(port string) bool {
	timeout := 500 * time.Millisecond
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", port), timeout)
	if err != nil {
		return false
	}
	if conn != nil {
		conn.Close()
		return true
	}
	return false
}

// InstallAndStartWithScoop installs DBs using scoop and runs them
func (a *App) InstallAndStartWithScoop() error {
	script := `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"

Write-Host "🚀 [INFO] 인프라 설치 스크립트 시작..."
# Ensure Scoop is installed
if (!(Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Host "🚀 [INFO] Scoop이 설치되어 있지 않습니다. 자동 설치를 진행합니다..."
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
} else {
    Write-Host "🚀 [INFO] Scoop이 이미 설치되어 있습니다."
}

# 현재 세션의 PATH에 Scoop shims 경로 임시 추가 (새로 설치된 명령어들 인식 목적)
$shims = "$env:USERPROFILE\scoop\shims"
if ($env:PATH -notlike "*$shims*") {
    $env:PATH = "$shims;" + $env:PATH
}

# Add main buckets if not present
scoop bucket add main
scoop bucket add versions

# Install packages
Write-Host "🚀 [INFO] PostgreSQL, Redis, MinIO 설치 확인 중 (Scoop)..."
scoop install postgresql redis minio | Out-Default

# Initialize PostgreSQL if needed
$pgData = "$env:USERPROFILE\scoop\apps\postgresql\current\data"
if (!(Test-Path "$pgData\PG_VERSION")) {
    Write-Host "🚀 [INFO] PostgreSQL 데이터베이스 초기화 중..."
    initdb -D $pgData -U postgres
}

# Start PostgreSQL
Write-Host "🚀 [INFO] PostgreSQL 구동 상태 확인 중..."
if (!(Get-Process postgres -ErrorAction SilentlyContinue)) {
    Write-Host "🚀 [INFO] PostgreSQL 백그라운드 실행 중..."
    pg_ctl -D $pgData -l "$pgData\..\logfile" start -w
} else {
    Write-Host "🚀 [INFO] PostgreSQL이 이미 실행 중입니다."
}

# Setup DB user and database
Write-Host "🚀 [INFO] edulinker 데이터베이스 및 권한 설정 중..."
psql -U postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='edulinker'" | Select-String -Quiet "1" | Out-Null
if ($LASTEXITCODE -ne 0) {
    psql -U postgres -c "CREATE USER edulinker WITH PASSWORD 'edulinker';"
}
psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='edulinker'" | Select-String -Quiet "1" | Out-Null
if ($LASTEXITCODE -ne 0) {
    psql -U postgres -c "CREATE DATABASE edulinker OWNER edulinker;"
}

# Start Redis
Write-Host "🚀 [INFO] Redis 백그라운드 실행 중..."
if (!(Get-Process redis-server -ErrorAction SilentlyContinue)) {
    Start-Process redis-server -WindowStyle Hidden
}

# Start MinIO
Write-Host "🚀 [INFO] MinIO 구동 상태 확인 중..."
$minioExe = "$shims\minio.exe"
if (!(Get-Command minio -ErrorAction SilentlyContinue) -and !(Test-Path $minioExe)) {
    Write-Host "🚀 [INFO] MinIO 직접 다운로드 병행 중 (Scoop 실패 대비)..."
    Invoke-WebRequest -Uri "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" -OutFile $minioExe
}

$minioData = "$env:USERPROFILE\minio_data"
if (!(Test-Path $minioData)) { New-Item -ItemType Directory -Force -Path $minioData | Out-Null }
if (!(Get-Process minio -ErrorAction SilentlyContinue)) {
    Write-Host "🚀 [INFO] MinIO 백그라운드 실행 중..."
    Start-Process "$minioExe" -ArgumentList "server", $minioData -WindowStyle Hidden
} else {
    Write-Host "🚀 [INFO] MinIO가 이미 실행 중입니다."
}

Write-Host "🚀 [INFO] 모든 인프라(Scoop 환경) 설정 및 실행 완료!"
`
	tmpFile := filepath.Join(os.TempDir(), "setup_edulinker_infra.ps1")
	scriptBytes := append([]byte{0xEF, 0xBB, 0xBF}, []byte(script)...)
	err := os.WriteFile(tmpFile, scriptBytes, 0755)
	if err != nil {
		return err
	}
	defer os.Remove(tmpFile)

	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-File", tmpFile)
	hiddenProcAttr(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return err
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		a.emitLog(scanner.Text())
	}

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("Scoop script failed: %v", err)
	}
	return nil
}
