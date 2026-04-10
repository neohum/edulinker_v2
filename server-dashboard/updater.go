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
)

// AppVersion is the current build version of server-dashboard.
// Update this constant before each release and tag as "server-vX.Y.Z".
const AppVersion = "v1.0.4"

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

	// Download file
	err := downloadFile(url, tmpFile)
	if err != nil {
		log.Printf("[Updater] 다운로드 실패: %v", err)
		return
	}

	log.Printf("[Updater] 다운로드 완료. 정숙 설치를 실행합니다: %s", tmpFile)
	
	// Execute Inno Setup silently: /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
	// We want it to restart the app, so we might omit /NORESTART or handle it.
	// Most Inno Setup scripts for this project have a [Run] section that restarts the app.
	cmd := exec.Command(tmpFile, "/VERYSILENT", "/SUPPRESSMSGBOXES")
	err = cmd.Start()
	if err != nil {
		log.Printf("[Updater] 설치 실행 실패: %v", err)
		return
	}

	log.Printf("[Updater] 설치 프로그램이 시작되었습니다. 앱이 곧 종료되고 업데이트됩니다.")
	// The installer will wait for this process to exit before replacing files
	time.Sleep(2 * time.Second)
	os.Exit(0)
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
