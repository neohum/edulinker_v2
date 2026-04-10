package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// AppVersion is the current build version of server-dashboard.
// Update this constant before each release and tag the commit as "server-vX.Y.Z".
const AppVersion = "v1.0.0"

const (
	githubOwner     = "neohum"
	githubRepo      = "edulinker_v2"
	githubTagPrefix = "server-v"
)

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Body    string `json:"body"`
}

// CheckForUpdate fetches the GitHub Releases list and emits "update:available"
// if a newer version tagged "server-vX.Y.Z" exists.
// Should be called in a goroutine from startup.
func (a *App) CheckForUpdate() {
	time.Sleep(4 * time.Second) // wait for UI to settle

	apiURL := "https://api.github.com/repos/" + githubOwner + "/" + githubRepo + "/releases"
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		log.Printf("[Updater] 요청 생성 실패: %v", err)
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "edulinker-server-dashboard/"+AppVersion)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Updater] GitHub API 요청 실패: %v", err)
		return
	}
	defer resp.Body.Close()

	var releases []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		log.Printf("[Updater] 응답 파싱 실패: %v", err)
		return
	}

	// Find the latest release with the server-v prefix
	for _, rel := range releases {
		if !strings.HasPrefix(rel.TagName, githubTagPrefix) {
			continue
		}
		latestVer := strings.TrimPrefix(rel.TagName, "server-")
		if semverIsNewer(latestVer, AppVersion) {
			log.Printf("[Updater] 새 버전 발견: %s (현재: %s)", rel.TagName, AppVersion)
			wailsRuntime.EventsEmit(a.ctx, "update:available", map[string]string{
				"version": rel.TagName,
				"url":     rel.HTMLURL,
				"notes":   rel.Body,
			})
		} else {
			log.Printf("[Updater] 최신 버전 사용 중: %s", AppVersion)
		}
		return // Only compare against the newest matching release
	}
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
// Both strings should be in "vX.Y.Z" format.
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
