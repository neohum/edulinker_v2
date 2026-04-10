package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// AppVersion is the current build version of server-dashboard.
// Update this constant before each release and tag as "server-vX.Y.Z".
const AppVersion = "v1.0.6"

const (
	githubOwner     = "neohum"
	githubRepo      = "edulinker_v2"
	githubTagPrefix = "server-v"
)

// githubToken is injected at build time via ldflags
var githubToken = ""

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Body    string `json:"body"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// CheckForUpdate fetches GitHub Releases and performs silent update if found.
func (a *App) CheckForUpdate() {
	// Wait for app to settle
	time.Sleep(10 * time.Second)
	log.Printf("[Updater] 업데이트 확인 시작... (현재 버전: %s)", AppVersion)

	apiURL := "https://api.github.com/repos/" + githubOwner + "/" + githubRepo + "/releases"
	client := &http.Client{Timeout: 30 * time.Second}

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "edulinker-server-dashboard/"+AppVersion)
	if githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+githubToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Updater] GitHub API 요청 실패: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return
	}

	var releases []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return
	}

	for _, rel := range releases {
		if !strings.HasPrefix(rel.TagName, githubTagPrefix) {
			continue
		}
		latestVer := strings.TrimPrefix(rel.TagName, githubTagPrefix)
		if semverIsNewer(latestVer, AppVersion) {
			log.Printf("[Updater] 새 버전 발견: %s. 자동 업데이트를 시작합니다.", rel.TagName)
			
			// Find .exe asset
			var downloadURL string
			for _, asset := range rel.Assets {
				if strings.HasSuffix(asset.Name, ".exe") && strings.Contains(asset.Name, "setup") {
					downloadURL = asset.BrowserDownloadURL
					break
				}
			}

			if downloadURL != "" {
				go a.performSilentUpdate(downloadURL, rel.TagName)
			}
		}
		return
	}
}

func (a *App) performSilentUpdate(url, version string) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("edulinker_server_setup_%s.exe", version))
	log.Printf("[Updater] 업데이트 파일 다운로드 중: %s", url)

	err := downloadFile(url, tmpFile)
	if err != nil {
		log.Printf("[Updater] 다운로드 실패: %v", err)
		return
	}

	log.Printf("[Updater] 다운로드 완료. 업데이터 스크립트를 준비합니다: %s", tmpFile)

	// Find current exe path for relaunch
	exePath, _ := os.Executable()

	// Write a PowerShell helper script that:
	//  1. Waits for this process to exit (so file locks are released)
	//  2. Runs the Inno Setup installer silently
	//  3. Relaunches the app
	pid := os.Getpid()
	psScript := fmt.Sprintf(`
$pid = %d
$installer = '%s'
$app = '%s'

# Wait for current process to exit
while (Get-Process -Id $pid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }

# Run installer silently
Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait

# Relaunch app
if (Test-Path $app) { Start-Process -FilePath $app }
`, pid, strings.ReplaceAll(tmpFile, `\`, `\\`), strings.ReplaceAll(exePath, `\`, `\\`))

	psFile := filepath.Join(os.TempDir(), fmt.Sprintf("edulinker_update_%s.ps1", version))
	if err := os.WriteFile(psFile, []byte(psScript), 0644); err != nil {
		log.Printf("[Updater] 스크립트 작성 실패: %v", err)
		return
	}

	cmd := exec.Command("powershell.exe",
		"-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden",
		"-File", psFile,
	)
	if err := cmd.Start(); err != nil {
		log.Printf("[Updater] 업데이터 스크립트 실행 실패: %v", err)
		return
	}

	log.Printf("[Updater] 업데이터 스크립트가 시작되었습니다. 앱을 종료하고 업데이트를 진행합니다.")
	// Give the PowerShell script a moment to start, then quit cleanly via Wails
	time.Sleep(500 * time.Millisecond)
	wailsRuntime.Quit(a.ctx)
}

func downloadFile(url, filepath string) error {
	client := &http.Client{Timeout: 300 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	if githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+githubToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

// GetAppVersion returns the current app version string (callable from frontend).
func (a *App) GetAppVersion() string {
	return AppVersion
}

// OpenExternalURL opens a URL in the system default browser.
func (a *App) OpenExternalURL(rawURL string) {
	exec.Command("cmd", "/c", "start", "", rawURL).Start()
}

// semverIsNewer returns true if candidate is strictly newer than current.
func semverIsNewer(candidate, current string) bool {
	c := parseSemver(candidate)
	r := parseSemver(current)
	for i := 0; i < 3; i++ {
		if c[i] > r[i] {
			return true
		}
		if c[i] < r[i] {
			return false
		}
	}
	return false
}

func parseSemver(v string) [3]int {
	v = strings.TrimPrefix(v, "v")
	parts := strings.Split(v, ".")
	var nums [3]int
	for i := 0; i < 3 && i < len(parts); i++ {
		n, _ := strconv.Atoi(parts[i])
		nums[i] = n
	}
	return nums
}
