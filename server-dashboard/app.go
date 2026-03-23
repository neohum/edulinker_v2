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

// GetLocalIP returns the non-loopback local IP of the host
func (a *App) GetLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "알 수 없음"
	}
	for _, address := range addrs {
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
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
			if strings.Contains(err.Error(), "does not exist") {
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
