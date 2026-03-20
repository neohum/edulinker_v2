package main

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
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
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		logs:     make([]string, 0),
		logLimit: 1000,
	}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// 대시보드 시작 시 혹시 모를 기존 고아 프로세스 즉시 종료 (5200 포트 점유 해제)
	killCmd := exec.Command("powershell", "-NoProfile", "-Command", "Get-NetTCPConnection -LocalPort 5200 -State Listen -ErrorAction SilentlyContinue | Select-Object -Unique -ExpandProperty OwningProcess | ForEach-Object { taskkill /F /T /PID $_ }")
	killCmd.Start()
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

// StartServer starts the edulinker API server
func (a *App) StartServer() error {
	a.serverLock.Lock()
	if a.isRunning {
		a.serverLock.Unlock()
		return nil
	}
	if a.isStarting {
		a.serverLock.Unlock()
		return nil // 중복 클릭 시 무시 (프론트에 에러 띄우지 않음)
	}
	a.isStarting = true
	a.serverLock.Unlock()

	defer func() {
		a.serverLock.Lock()
		a.isStarting = false
		a.serverLock.Unlock()
	}()

	// Make sure any detached process on port 5200 is killed before starting
	killCmd := exec.Command("powershell", "-NoProfile", "-Command", "Get-NetTCPConnection -LocalPort 5200 -State Listen -ErrorAction SilentlyContinue | Select-Object -Unique -ExpandProperty OwningProcess | ForEach-Object { taskkill /F /T /PID $_ }")
	killCmd.Run()
	time.Sleep(500 * time.Millisecond)

	a.serverLock.Lock()
	defer a.serverLock.Unlock()

	// Find backend directory by searching upwards
	dir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get working dir: %w", err)
	}

	backendDir := ""
	for i := 0; i < 4; i++ {
		tryPath := filepath.Join(dir, "backend")
		if stat, err := os.Stat(tryPath); err == nil && stat.IsDir() {
			backendDir = tryPath
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	if backendDir == "" {
		return fmt.Errorf("backend directory not found")
	}

	cmd := exec.Command("go", "run", "./cmd/api-server/")
	cmd.Dir = backendDir
	// CREATE_NO_WINDOW = 0x08000000
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x08000000, HideWindow: true}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	a.serverCmd = cmd
	a.isRunning = true
	a.startTime = time.Now()

	startupMsg := "🚀 [DASHBOARD] 서버 구동 프로세스가 시작되었습니다. 로그를 대기합니다..."
	a.logs = []string{startupMsg} // Reset logs
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "server-log", startupMsg)
	}

	// Read stdout asynchronously
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			text := scanner.Text()

			a.serverLock.Lock()
			a.logs = append(a.logs, text)
			if len(a.logs) > a.logLimit {
				a.logs = a.logs[1:]
			}
			a.serverLock.Unlock()

			if a.ctx != nil {
				runtime.EventsEmit(a.ctx, "server-log", text)
			}
		}
	}()

	// Read stderr asynchronously
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			text := scanner.Text()

			a.serverLock.Lock()
			a.logs = append(a.logs, "[STDERR] "+text)
			if len(a.logs) > a.logLimit {
				a.logs = a.logs[1:]
			}
			a.serverLock.Unlock()

			if a.ctx != nil {
				runtime.EventsEmit(a.ctx, "server-log", "[STDERR] "+text)
			}
		}
	}()

	// Wait routine
	go func() {
		processErr := cmd.Wait()
		if processErr != nil {
			msg := fmt.Sprintf("❌ [DASHBOARD] 서버 프로세스가 종료되었습니다: %v", processErr)
			a.serverLock.Lock()
			a.logs = append(a.logs, msg)
			a.serverLock.Unlock()
			if a.ctx != nil {
				runtime.EventsEmit(a.ctx, "server-log", msg)
			}
		} else {
			msg := "🛑 [DASHBOARD] 서버 프로세스가 정상 종료되었습니다."
			a.serverLock.Lock()
			a.logs = append(a.logs, msg)
			a.serverLock.Unlock()
			if a.ctx != nil {
				runtime.EventsEmit(a.ctx, "server-log", msg)
			}
		}

		a.serverLock.Lock()
		// Only set false if this process is still the active serverCmd
		if a.serverCmd == cmd {
			a.isRunning = false
			a.serverCmd = nil
		}
		a.serverLock.Unlock()

		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "server-stopped")
		}
	}()

	return nil
}

// StopServer kills the API server
func (a *App) StopServer() error {
	a.serverLock.Lock()
	defer a.serverLock.Unlock()

	if !a.isRunning || a.serverCmd == nil || a.serverCmd.Process == nil {
		return fmt.Errorf("server is not running")
	}

	// Terminate the process tree
	pid := a.serverCmd.Process.Pid
	killCmd := exec.Command("taskkill", "/T", "/F", "/PID", fmt.Sprintf("%d", pid))
	err := killCmd.Run()
	if err != nil {
		// Fallback to process.Kill()
		a.serverCmd.Process.Kill()
	}

	a.isRunning = false
	a.serverCmd = nil

	return nil
}

// GetLogs returns the current buffered logs
func (a *App) GetLogs() []string {
	a.serverLock.Lock()
	defer a.serverLock.Unlock()

	// Return a copy to avoid data races
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
		defer conn.Close()
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
	# 기본 패스워드 환경변수가 현재 쉘에 없으므로 기본 minioadmin/minioadmin 으로 열림
} else {
    Write-Host "🚀 [INFO] MinIO가 이미 실행 중입니다."
}

Write-Host "🚀 [INFO] 모든 인프라(Scoop 환경) 설정 및 실행 완료!"
`
	tmpFile := filepath.Join(os.TempDir(), "setup_edulinker_infra.ps1")
	// Save the powershell script with a UTF-8 BOM so Windows PowerShell doesn't break Korean chars
	scriptBytes := append([]byte{0xEF, 0xBB, 0xBF}, []byte(script)...)
	err := os.WriteFile(tmpFile, scriptBytes, 0755)
	if err != nil {
		return err
	}
	defer os.Remove(tmpFile)

	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-File", tmpFile)

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
		text := scanner.Text()

		a.serverLock.Lock()
		a.logs = append(a.logs, text)
		if len(a.logs) > a.logLimit {
			a.logs = a.logs[1:]
		}
		a.serverLock.Unlock()

		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "server-log", text)
		}
	}

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("Scoop script failed: %v", err)
	}
	return nil
}
