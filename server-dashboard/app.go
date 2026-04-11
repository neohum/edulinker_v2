package main

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

	"github.com/getlantern/systray"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

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

	// Start system tray in goroutine (safe on Windows, blocking main thread usually needed only for specific OS like macOS but Wails owns main thread)
	go systray.Run(a.onTrayReady, a.onTrayExit)
	go a.CheckForUpdate()
}

func (a *App) onTrayReady() {
	systray.SetIcon(trayIcon)
	systray.SetTitle("edulinker")
	systray.SetTooltip("edulinker 서버 대시보드")

	mShow := systray.AddMenuItem("대시보드 열기", "숨겨진 대시보드 화면을 엽니다")
	mQuit := systray.AddMenuItem("완전 종료", "대시보드와 서버를 완전히 종료합니다")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				if a.ctx != nil {
					wailsRuntime.WindowShow(a.ctx)
				}
			case <-mQuit.ClickedCh:
				a.StopServer()
				systray.Quit()
			}
		}
	}()
}

func (a *App) onTrayExit() {
	if a.ctx != nil {
		wailsRuntime.Quit(a.ctx)
	}
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

// emitLog appends to internal log buffer and pushes to frontend (with wall-clock timestamp prefix)
func (a *App) emitLog(msg string) {
	stamped := time.Now().Format("15:04:05") + " " + msg
	a.serverLock.Lock()
	a.logs = append(a.logs, stamped)
	if len(a.logs) > a.logLimit {
		a.logs = a.logs[1:]
	}
	a.serverLock.Unlock()

	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, "server-log", stamped)
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

// GetLocalIP returns the non-loopback local IP of the host, prioritizing standard private subnets
func (a *App) GetLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "알 수 없음"
	}

	var fallbackIP string
	for _, address := range addrs {
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				ipStr := ipnet.IP.String()

				// 169.254 (APIPA/가상어댑터)는 가급적 제외
				if strings.HasPrefix(ipStr, "169.254.") {
					continue
				}

				// 공유기가 할당한 사설 IP 대역 우선순위 부여
				if strings.HasPrefix(ipStr, "192.168.") || strings.HasPrefix(ipStr, "10.") || strings.HasPrefix(ipStr, "172.") {
					return ipStr
				}

				if fallbackIP == "" {
					fallbackIP = ipStr
				}
			}
		}
	}

	if fallbackIP != "" {
		return fallbackIP
	}

	return "알 수 없음"
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

func (a *App) ensureLocalInfra() {
	userProfile := os.Getenv("USERPROFILE")
	if userProfile == "" {
		return
	}

	if !checkPort("6379") {
		redisExe := filepath.Join(userProfile, "scoop", "apps", "redis", "current", "redis-server.exe")
		if _, err := os.Stat(redisExe); err == nil {
			a.emitLog("🔄 [DASHBOARD] 백그라운드 Redis 서버를 연동 구동합니다...")
			cmd := exec.Command(redisExe)
			hiddenProcAttr(cmd)
			cmd.Start()
		}
	}

	if !checkPort("9000") {
		minioExe := filepath.Join(userProfile, "scoop", "apps", "minio", "current", "minio.exe")
		minioData := filepath.Join(userProfile, "minio_data")
		if _, err := os.Stat(minioExe); err == nil {
			a.emitLog("🔄 [DASHBOARD] 백그라운드 MinIO 스토리지 서버를 연동 구동합니다...")
			cmd := exec.Command(minioExe, "server", minioData)
			hiddenProcAttr(cmd)
			cmd.Start()
		}
	}
	time.Sleep(1 * time.Second) // 포트 개방 대기
}

func (a *App) buildAndStart() {
	defer func() {
		a.serverLock.Lock()
		a.isStarting = false
		a.serverLock.Unlock()
	}()

	// 인프라가 강제 종료되어 있다면 대시보드가 직접 백그라운드 구동을 보장함
	a.ensureLocalInfra()

	// Step 0: Kill anything on port 5200
	a.emitLog("🧹 [DASHBOARD] 기존 프로세스 정리 중...")
	killPort5200()
	waitForPortCleared()

	// Step 1: Build
	a.emitLog("🔨 [DASHBOARD] 백엔드 빌드 중... (첫 실행 시 시간이 걸릴 수 있습니다)")

	exePath := filepath.Join(a.backendDir, "api-server.exe")

	// 환경 변수 PATH 갱신이 반영되지 않은 경우(예: Go 설치 직후)를 대비해 go 경로 동적 탐색
	// Force scoop shims into the current process PATH so LookPath can find 'go' if installed via scoop
	scoopShims := filepath.Join(os.Getenv("USERPROFILE"), "scoop", "shims")
	if !strings.Contains(os.Getenv("PATH"), scoopShims) {
		os.Setenv("PATH", scoopShims+";"+os.Getenv("PATH"))
	}

	goExe := "go"
	if path, err := exec.LookPath("go"); err == nil {
		goExe = path
	} else {
		possiblePaths := []string{
			filepath.Join(os.Getenv("USERPROFILE"), "scoop", "apps", "go", "current", "bin", "go.exe"),
			`C:\Program Files\Go\bin\go.exe`,
			`C:\Program Files (x86)\Go\bin\go.exe`,
			filepath.Join(os.Getenv("USERPROFILE"), "go", "bin", "go.exe"),
		}
		for _, p := range possiblePaths {
			if _, err := os.Stat(p); err == nil {
				goExe = p
				break
			}
		}
	}

	buildCmd := exec.Command(goExe, "build", "-o", exePath, "./cmd/api-server/")
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
	// Inherit current env and inject dashboard version so admin_heartbeat can report it
	cmd.Env = append(os.Environ(), "SERVER_DASHBOARD_VERSION="+AppVersion)
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

	// Stream stdout safely without line length limits
	go func() {
		reader := bufio.NewReader(stdout)
		var lineBuf bytes.Buffer
		for {
			chunk, isPrefix, err := reader.ReadLine()
			if err != nil {
				break
			}
			lineBuf.Write(chunk)
			if !isPrefix {
				a.emitLog(lineBuf.String())
				lineBuf.Reset()
			}
		}
	}()

	// Stream stderr safely
	go func() {
		reader := bufio.NewReader(stderr)
		var lineBuf bytes.Buffer
		for {
			chunk, isPrefix, err := reader.ReadLine()
			if err != nil {
				break
			}
			lineBuf.Write(chunk)
			if !isPrefix {
				a.emitLog("[STDERR] " + lineBuf.String())
				lineBuf.Reset()
			}
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
	Go       bool `json:"go"`
}

// CheckDependencies dials ports to check if infrastructure is active
func (a *App) CheckDependencies() DependencyStatus {
	_, err := exec.LookPath("go")
	hasGo := err == nil

	return DependencyStatus{
		Postgres: checkPort("5432"),
		Redis:    checkPort("6379"),
		Minio:    checkPort("9000"),
		Go:       hasGo,
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
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
# NOTE: ErrorActionPreference is intentionally NOT set to Stop.
# Each step is wrapped in try/catch so a failure in one step does not abort all steps.
$ErrorActionPreference = "Continue"

$globalSW = [System.Diagnostics.Stopwatch]::StartNew()

function ts {
    $e = $globalSW.Elapsed
    return "[{0:D2}:{1:D2}:{2:D2}]" -f $e.Hours, $e.Minutes, $e.Seconds
}

function Run-Step {
    param([string]$Label, [scriptblock]$Block)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Host "$(ts) ▶ $Label 시작..."
    try {
        & $Block
        $sw.Stop()
        Write-Host "$(ts) ✅ $Label 완료 (+$([math]::Round($sw.Elapsed.TotalSeconds,1))s)"
    } catch {
        $sw.Stop()
        Write-Host "$(ts) ⚠️ $Label 실패/경고 (+$([math]::Round($sw.Elapsed.TotalSeconds,1))s): $_"
    }
}

Write-Host "$(ts) 🚀 인프라 설치 스크립트 시작"

# ── Step 1: Scoop ────────────────────────────────────────────────────────────
Run-Step "Scoop 설치 확인" {
    if (!(Get-Command scoop -ErrorAction SilentlyContinue)) {
        Write-Host "$(ts)   Scoop이 없습니다. 자동 설치 중..."
        # Set-ExecutionPolicy may throw if overridden by group policy (effective policy may
        # already be Bypass which is fine). Catch and ignore — installation proceeds regardless.
        try {
            Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
        } catch {
            Write-Host "$(ts)   Set-ExecutionPolicy 경고 (무시 가능): $_"
        }
        iex "& {$(irm get.scoop.sh)} -RunAsAdmin"
        Write-Host "$(ts)   Scoop 설치 완료."
    } else {
        Write-Host "$(ts)   Scoop이 이미 설치되어 있습니다."
    }
}

$shims = "$env:USERPROFILE\scoop\shims"
if ($env:PATH -notlike "*$shims*") { $env:PATH = "$shims;" + $env:PATH }

# 영구적으로 사용자 PATH 환경 변수에 scoop shims 추가
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$shims*") {
    [Environment]::SetEnvironmentVariable("PATH", "$shims;" + $userPath, "User")
    Write-Host "$(ts)   사용자 환경 변수에 Scoop shims PATH가 등록되었습니다."
}

# ── Step 2: Git ──────────────────────────────────────────────────────────────
Run-Step "Git 설치 확인" {
    if (!(Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host "$(ts)   Git을 설치합니다..."
        scoop install git 2>&1 | ForEach-Object { Write-Host "$(ts)   $_" }
    } else {
        Write-Host "$(ts)   Git이 이미 설치되어 있습니다."
    }
}

# ── Step 3: Buckets ──────────────────────────────────────────────────────────
Run-Step "Scoop 버킷 추가 (main / versions / extras)" {
    foreach ($b in @("main","versions","extras")) {
        $out = scoop bucket add $b 2>&1
        Write-Host "$(ts)   버킷 '$b': $out"
    }
}

# ── Step 4~6: Install packages individually so partial failures are visible ──
foreach ($pkg in @("go","aria2","redis","minio","nssm")) {
    Run-Step "$pkg 설치" {
        $installed = scoop list 2>&1 | Select-String -Pattern "^\s*$pkg\s+"
        if ($installed) {
            Write-Host "$(ts)   $pkg 이미 설치되어 있습니다."
        } else {
            Write-Host "$(ts)   $pkg 설치 중..."
            scoop install $pkg 2>&1 | ForEach-Object { Write-Host "$(ts)   $_" }
        }
    }
}

# ── Step 7: PostgreSQL 공식 설치 (EnterpriseDB) ──────────────────────────
Run-Step "PostgreSQL 공식 윈도우 설치 프로그램 실행" {
    $pgVersion = "15"
    $pgInstallDir = "$env:ProgramFiles\PostgreSQL\$pgVersion"
    $pgBin = "$pgInstallDir\bin"
    $installerUrl = "https://get.enterprisedb.com/postgresql/postgresql-15.6-1-windows-x64.exe"
    $installerFile = "$env:TEMP\postgresql-installer.exe"
    
    if (!(Test-Path "$pgBin\psql.exe")) {
        Write-Host "$(ts)   PostgreSQL 공식 설치 파일 다운로드 중 (약 340MB, 최대 1~3분 소요)..."
        # 다운로드 일관성(항상 동일한 exe 파일 보장)을 위해 aria2 대신 기본 WebRequest 사용
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerFile
        
        Write-Host "$(ts)   ⚠️ [중요] 데이터베이스 설치 권한을 위해 화면 하단 방패아이콘(UAC)을 눌러 '예'를 선택해주세요."
        Write-Host "$(ts)   PostgreSQL 무인 설치(Unattended) 진행 중... (완료될 때까지 창이 뜨지 않습니다)"
        
        $installArgs = "--mode unattended --superpassword postgres --serverport 5432 --servicename postgresql-x64-$pgVersion"
        $proc = Start-Process -FilePath $installerFile -ArgumentList $installArgs -Verb RunAs -Wait -PassThru
        
        if ($proc.ExitCode -eq 0) {
            Write-Host "$(ts)   PostgreSQL 설치 및 공식 서비스 등록 완료."
        } else {
            Write-Host "$(ts)   PostgreSQL 설치 중 오류 발생 (또는 권한 거부됨). ExitCode: $($proc.ExitCode)"
        }
    } else {
        Write-Host "$(ts)   PostgreSQL이 이미 공식 경로($pgInstallDir)에 설치되어 있습니다."
    }
    
    # 설치된 psql 경로를 현재 환경 변수에 추가 (이후 DB 초기화 단계용)
    if ($env:PATH -notlike "*$pgBin*") { $env:PATH = "$pgBin;" + $env:PATH }
}

# ── Step 8: 백그라운드 인프라 (Redis, MinIO) 실행 ──────────────────────────
Run-Step "백그라운드 자동 구동 파워쉘 우회 실행" {
    $minioData = "{0}\minio_data" -f $env:USERPROFILE
    if (!(Test-Path $minioData)) { New-Item -ItemType Directory -Force -Path $minioData | Out-Null }
    
    $redisExe = "{0}\scoop\apps\redis\current\redis-server.exe" -f $env:USERPROFILE
    $minioExe = "{0}\scoop\apps\minio\current\minio.exe" -f $env:USERPROFILE
    
    Write-Host "$(ts)   파워쉘 백그라운드 프로세스로 Redis 및 MinIO 즉시 분리 실행 중..."
    
    # 혹시 작동 중일 수 있는 기존 프로세스 안전 종료
    Try { Stop-Process -Name "redis-server" -Force -ErrorAction SilentlyContinue } Catch {}
    
    # 네이티브 파워쉘 분리(Detached) 프로세스로 실행 (VBS 차단 환경 우회)
    if (Test-Path $redisExe) {
        Start-Process -FilePath $redisExe -WindowStyle Hidden
    }
    if (Test-Path $minioExe) {
        Start-Process -FilePath $minioExe -ArgumentList "server ""$minioData""" -WindowStyle Hidden
    }
    
    # 혹시 남아있을 기존 서비스/예약작업 정리 (권한 없으면 조용히 무시)
    Try {
        sc.exe delete "Edu_PostgreSQL" 2>$null
        sc.exe delete "Edu_Redis" 2>$null
        sc.exe delete "Edu_MinIO" 2>$null
        Get-ScheduledTask -TaskName "Edu_PostgreSQL_AutoStart", "Edu_Redis_AutoStart", "Edu_MinIO_AutoStart" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
    } Catch {}
}

# ── Step 9: DB 사용자 / 데이터베이스 ────────────────────────────────────────
Run-Step "edulinker DB 사용자 및 데이터베이스 생성" {
    Write-Host "$(ts)   PostgreSQL 접속 대기 중..."
    $env:PGPASSWORD = "postgres"
    $retry = 0
    while ($retry -lt 15) {
        $check = psql -U postgres -tAc "SELECT 1" 2>&1
        if ($LASTEXITCODE -eq 0 -or "$check" -match "1") { break }
        Start-Sleep -Seconds 2
        $retry++
    }

    $userExists = psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='edulinker'" 2>&1
    if ("$userExists" -match "1") {
        Write-Host "$(ts)   edulinker 사용자가 이미 존재합니다."
    } else {
        Write-Host "$(ts)   edulinker 사용자 생성 중..."
        psql -U postgres -c "CREATE USER edulinker WITH PASSWORD 'edulinker';" 2>&1 | ForEach-Object { Write-Host "$(ts)   $_" }
    }
    $dbExists = psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='edulinker'" 2>&1
    if ("$dbExists" -match "1") {
        Write-Host "$(ts)   edulinker 데이터베이스가 이미 존재합니다."
    } else {
        Write-Host "$(ts)   edulinker 데이터베이스 생성 중..."
        psql -U postgres -c "CREATE DATABASE edulinker OWNER edulinker;" 2>&1 | ForEach-Object { Write-Host "$(ts)   $_" }
    }
}

$total = [math]::Round($globalSW.Elapsed.TotalSeconds, 1)
Write-Host "$(ts) 🎉 모든 인프라 설정 완료! (총 소요 시간: ${total}s)"
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

// DBUser represents a simplified user view for the dashboard
type DBUser struct {
	ID          string `json:"id"`
	SchoolID    string `json:"school_id"`
	SchoolName  string `json:"school_name"`
	Name        string `json:"name"`
	Phone       string `json:"phone"`
	Role        string `json:"role"`
	Grade       int    `json:"grade"`
	ClassNum    int    `json:"class_num"`
	Number      int    `json:"number"`
	Gender      string `json:"gender"`
	Position    string `json:"position"`
	StudentName string `json:"student_name"`
	IsActive    bool   `json:"is_active"`
	CreatedAt   string `json:"created_at"`
}

func getDBConn() (*sql.DB, error) {
	connStr := "user=edulinker password=edulinker dbname=edulinker sslmode=disable host=localhost port=5432"
	return sql.Open("postgres", connStr)
}

func (a *App) GetDBUsers() ([]DBUser, error) {
	db, err := getDBConn()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT u.id, u.school_id, COALESCE(s.name, ''), u.name, u.phone, u.role, 
               CASE WHEN u.role = 'parent' THEN COALESCE((SELECT student.grade FROM parent_students ps JOIN users student ON ps.student_id = student.id WHERE ps.parent_id = u.id LIMIT 1), 0) ELSE u.grade END as grade,
               CASE WHEN u.role = 'parent' THEN COALESCE((SELECT student.class_num FROM parent_students ps JOIN users student ON ps.student_id = student.id WHERE ps.parent_id = u.id LIMIT 1), 0) ELSE u.class_num END as class_num,
               CASE WHEN u.role = 'parent' THEN COALESCE((SELECT student.number FROM parent_students ps JOIN users student ON ps.student_id = student.id WHERE ps.parent_id = u.id LIMIT 1), 0) ELSE COALESCE(u.number, 0) END as number,
               COALESCE(u.gender, '') as gender, COALESCE(u.position, '') as position,
               (SELECT student.name FROM parent_students ps JOIN users student ON ps.student_id = student.id WHERE ps.parent_id = u.id LIMIT 1) as student_name,
               u.is_active, u.created_at
		FROM users u
		LEFT JOIN schools s ON u.school_id = s.id
		WHERE u.is_active = true
		ORDER BY u.role, u.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []DBUser
	for rows.Next() {
		var u DBUser
		var created time.Time
		var schoolID sql.NullString
		var number sql.NullInt64
		var gender sql.NullString
		var position sql.NullString
		var studentName sql.NullString
		if err := rows.Scan(&u.ID, &schoolID, &u.SchoolName, &u.Name, &u.Phone, &u.Role, &u.Grade, &u.ClassNum, &number, &gender, &position, &studentName, &u.IsActive, &created); err != nil {
			return nil, err
		}
		if schoolID.Valid {
			u.SchoolID = schoolID.String
		}
		if number.Valid {
			u.Number = int(number.Int64)
		}
		if gender.Valid {
			u.Gender = gender.String
		}
		if studentName.Valid {
			u.StudentName = studentName.String
		}
		u.CreatedAt = created.Format(time.RFC3339)
		users = append(users, u)
	}
	return users, nil
}

func (a *App) DeleteDBUser(id string) error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE users SET is_active = false WHERE id = $1", id)
	return err
}

func (a *App) DeactivateMultipleDBUsers(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf("UPDATE users SET is_active = false WHERE id IN (%s)", strings.Join(placeholders, ","))
	_, err = db.Exec(query, args...)
	return err
}

func (a *App) GetInactiveDBUsers() ([]DBUser, error) {
	db, err := getDBConn()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT u.id, u.school_id, COALESCE(s.name, ''), u.name, u.phone, u.role, 
               CASE WHEN u.role = 'parent' THEN COALESCE((SELECT student.grade FROM parent_students ps JOIN users student ON ps.student_id = student.id WHERE ps.parent_id = u.id LIMIT 1), 0) ELSE u.grade END as grade,
               CASE WHEN u.role = 'parent' THEN COALESCE((SELECT student.class_num FROM parent_students ps JOIN users student ON ps.student_id = student.id WHERE ps.parent_id = u.id LIMIT 1), 0) ELSE u.class_num END as class_num,
               CASE WHEN u.role = 'parent' THEN COALESCE((SELECT student.number FROM parent_students ps JOIN users student ON ps.student_id = student.id WHERE ps.parent_id = u.id LIMIT 1), 0) ELSE COALESCE(u.number, 0) END as number,
               COALESCE(u.gender, '') as gender, COALESCE(u.position, '') as position,
               (SELECT student.name FROM parent_students ps JOIN users student ON ps.student_id = student.id WHERE ps.parent_id = u.id LIMIT 1) as student_name,
               u.is_active, u.created_at
		FROM users u
		LEFT JOIN schools s ON u.school_id = s.id
		WHERE u.is_active = false
		ORDER BY u.role, u.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []DBUser
	for rows.Next() {
		var u DBUser
		var created time.Time
		var schoolID sql.NullString
		var number sql.NullInt64
		var gender sql.NullString
		var position sql.NullString
		var studentName sql.NullString
		if err := rows.Scan(&u.ID, &schoolID, &u.SchoolName, &u.Name, &u.Phone, &u.Role, &u.Grade, &u.ClassNum, &number, &gender, &position, &studentName, &u.IsActive, &created); err != nil {
			return nil, err
		}
		if schoolID.Valid {
			u.SchoolID = schoolID.String
		}
		if number.Valid {
			u.Number = int(number.Int64)
		}
		if gender.Valid {
			u.Gender = gender.String
		}
		if position.Valid {
			u.Position = position.String
		}
		if studentName.Valid {
			u.StudentName = studentName.String
		}
		u.CreatedAt = created.Format(time.RFC3339)
		users = append(users, u)
	}
	return users, nil
}

func (a *App) ReactivateDBUser(id string) error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE users SET is_active = true WHERE id = $1", id)
	return err
}

func (a *App) HardDeleteDBUser(id string) error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	queries := []struct {
		desc string
		sql  string
	}{
		{"sendoc 참조 해제", "UPDATE sendocs SET author_id = NULL WHERE author_id = $1"},
		{"schoolevent 참조 해제", "UPDATE school_events SET author_id = NULL WHERE author_id = $1"},
		{"gatong 참조 해제", "UPDATE gatongs SET author_id = NULL WHERE author_id = $1"},
		{"학부모-학생 연결", "DELETE FROM parent_students WHERE parent_id = $1 OR student_id = $1"},
		{"sendoc 수신자", "DELETE FROM sendoc_recipients WHERE user_id = $1"},
		{"gatong 응답", "DELETE FROM gatong_responses WHERE user_id = $1"},
		{"schoolevent 참여", "DELETE FROM school_event_participants WHERE user_id = $1"},
		{"ai 분석 기록", "DELETE FROM ai_analysis_logs WHERE teacher_id = $1 OR target_student_id = $1"},
		{"학생 상담 기록", "DELETE FROM student_counselings WHERE teacher_id = $1 OR student_id = $1"},
		{"학생 결석 기록", "DELETE FROM student_absences WHERE student_id = $1"},
		{"교사 인사 기록", "DELETE FROM teacher_hr_records WHERE teacher_id = $1"},
		{"교육과정 계획", "DELETE FROM curriculum_plans WHERE teacher_id = $1"},
		{"교육과정 평가", "DELETE FROM curriculum_evaluations WHERE teacher_id = $1 OR student_id = $1"},
	}

	for _, q := range queries {
		// Use savepoint to safely catch and ignore "table does not exist" or specific FK errors that don't apply
		tx.Exec("SAVEPOINT delete_sp")
		if _, err := tx.Exec(q.sql, id); err != nil {
			if strings.Contains(err.Error(), "does not exist") || strings.Contains(err.Error(), "릴레이션") || strings.Contains(err.Error(), "42P01") {
				tx.Exec("ROLLBACK TO SAVEPOINT delete_sp")
			} else {
				tx.Rollback()
				return fmt.Errorf("%s 처리 중 DB 오류: %w", q.desc, err)
			}
		} else {
			tx.Exec("RELEASE SAVEPOINT delete_sp")
		}
	}

	// 3. Finally, Hard delete the user itself
	if _, err := tx.Exec("DELETE FROM users WHERE id = $1", id); err != nil {
		tx.Rollback()
		return fmt.Errorf("사용자 본체 레코드 영구 삭제 실패: %w", err)
	}

	return tx.Commit()
}

func (a *App) HardDeleteAllInactiveUsers() error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	queries := []struct {
		desc string
		sql  string
	}{
		{"sendoc 참조 해제", "UPDATE sendocs SET author_id = NULL WHERE author_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"schoolevent 참조 해제", "UPDATE school_events SET author_id = NULL WHERE author_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"gatong 참조 해제", "UPDATE gatongs SET author_id = NULL WHERE author_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"학부모-학생 연결", "DELETE FROM parent_students WHERE parent_id IN (SELECT id FROM users WHERE is_active = false) OR student_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"sendoc 수신자", "DELETE FROM sendoc_recipients WHERE user_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"gatong 응답", "DELETE FROM gatong_responses WHERE user_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"schoolevent 참여", "DELETE FROM school_event_participants WHERE user_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"ai 분석 기록", "DELETE FROM ai_analysis_logs WHERE teacher_id IN (SELECT id FROM users WHERE is_active = false) OR target_student_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"학생 상담 기록", "DELETE FROM student_counselings WHERE teacher_id IN (SELECT id FROM users WHERE is_active = false) OR student_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"학생 결석 기록", "DELETE FROM student_absences WHERE student_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"교사 인사 기록", "DELETE FROM teacher_hr_records WHERE teacher_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"교육과정 계획", "DELETE FROM curriculum_plans WHERE teacher_id IN (SELECT id FROM users WHERE is_active = false)"},
		{"교육과정 평가", "DELETE FROM curriculum_evaluations WHERE teacher_id IN (SELECT id FROM users WHERE is_active = false) OR student_id IN (SELECT id FROM users WHERE is_active = false)"},
	}

	for _, q := range queries {
		tx.Exec("SAVEPOINT delete_all_sp")
		if _, err := tx.Exec(q.sql); err != nil {
			if strings.Contains(err.Error(), "does not exist") || strings.Contains(err.Error(), "릴레이션") || strings.Contains(err.Error(), "42P01") {
				tx.Exec("ROLLBACK TO SAVEPOINT delete_all_sp")
			} else {
				tx.Rollback()
				return fmt.Errorf("%s 처리 중 DB 오류: %w", q.desc, err)
			}
		} else {
			tx.Exec("RELEASE SAVEPOINT delete_all_sp")
		}
	}

	// Finally, Hard delete the inactive users themselves
	if _, err := tx.Exec("DELETE FROM users WHERE is_active = false"); err != nil {
		tx.Rollback()
		return fmt.Errorf("비활성 사용자 본체 레코드 영구 삭제 실패: %w", err)
	}

	return tx.Commit()
}

func (a *App) ResetDBUserPassword(id string, newPassword string) error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = db.Exec("UPDATE users SET password_hash = $1 WHERE id = $2", string(hash), id)
	return err
}

func (a *App) UpdateDBUserPosition(id string, position string) error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE users SET position = $1 WHERE id = $2", position, id)
	return err
}

func (a *App) UpdateDBUserRole(id string, role string) error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("UPDATE users SET role = $1 WHERE id = $2", role, id)
	return err
}

// ── 문서 관리 ──

type DBKnowledgeDoc struct {
	ID               string `json:"id"`
	SchoolID         string `json:"school_id"`
	Title            string `json:"title"`
	SourceType       string `json:"source_type"`
	OriginalFilename string `json:"original_filename"`
	FileURL          string `json:"file_url"`
	MarkdownContent  string `json:"markdown_content"`
	CreatedBy        string `json:"created_by"`
	CreatedByName    string `json:"created_by_name"`
	CreatedAt        string `json:"created_at"`
}

func (a *App) GetDBKnowledgeDocs() ([]DBKnowledgeDoc, error) {
	db, err := getDBConn()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT kd.id, kd.school_id, COALESCE(kd.title, ''),
		       COALESCE(kd.source_type, 'text'),
		       COALESCE(kd.original_filename, ''),
		       COALESCE(kd.file_url, ''),
		       COALESCE(kd.markdown_content, ''),
		       kd.created_by::text,
		       COALESCE(u.name, '') as created_by_name,
		       kd.created_at
		FROM knowledge_docs kd
		LEFT JOIN users u ON kd.created_by = u.id
		ORDER BY kd.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []DBKnowledgeDoc
	for rows.Next() {
		var d DBKnowledgeDoc
		var createdAt time.Time
		var schoolID sql.NullString
		if err := rows.Scan(&d.ID, &schoolID, &d.Title, &d.SourceType,
			&d.OriginalFilename, &d.FileURL, &d.MarkdownContent,
			&d.CreatedBy, &d.CreatedByName, &createdAt); err != nil {
			continue
		}
		if schoolID.Valid {
			d.SchoolID = schoolID.String
		}
		d.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z")
		docs = append(docs, d)
	}
	return docs, nil
}

func (a *App) DeleteDBKnowledgeDoc(docID string) error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("DELETE FROM knowledge_docs WHERE id = $1", docID)
	return err
}

// ── 공문 관리 ──

type DBAnnouncement struct {
	ID              string `json:"id"`
	SchoolID        string `json:"school_id"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	Type            string `json:"type"`
	IsUrgent        bool   `json:"is_urgent"`
	MarkdownContent string `json:"markdown_content"`
	AttachmentsJSON string `json:"attachments_json"`
	CreatedBy       string `json:"created_by"`
	CreatedByName   string `json:"created_by_name"`
	CreatedAt       string `json:"created_at"`
}

func (a *App) GetDBAnnouncements() ([]DBAnnouncement, error) {
	db, err := getDBConn()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT a.id, a.school_id, COALESCE(a.title, ''),
		       COALESCE(a.content, ''),
		       COALESCE(a.type, 'simple'),
		       a.is_urgent,
		       COALESCE(a.markdown_content, ''),
		       COALESCE(a.attachments_json, '[]'),
		       a.author_id::text,
		       COALESCE(u.name, '') as created_by_name,
		       a.created_at
		FROM announcements a
		LEFT JOIN users u ON a.author_id = u.id
		ORDER BY a.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var anns []DBAnnouncement
	for rows.Next() {
		var d DBAnnouncement
		var createdAt time.Time
		var schoolID sql.NullString
		if err := rows.Scan(&d.ID, &schoolID, &d.Title,
			&d.Content, &d.Type, &d.IsUrgent,
			&d.MarkdownContent, &d.AttachmentsJSON,
			&d.CreatedBy, &d.CreatedByName, &createdAt); err != nil {
			continue
		}
		if schoolID.Valid {
			d.SchoolID = schoolID.String
		}
		d.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z")
		anns = append(anns, d)
	}
	return anns, nil
}

func (a *App) DeleteDBAnnouncement(id string) error {
	db, err := getDBConn()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec("DELETE FROM announcements WHERE id = $1", id)
	return err
}
