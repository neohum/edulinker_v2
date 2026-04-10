package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// AppVersion is the current build version of the teacher-app.
// Update this constant before each release and tag as "teacher-vX.Y.Z".
const AppVersion = "v1.0.2"

const (
	githubOwner     = "neohum"
	githubRepo      = "edulinker_v2"
	githubTagPrefix = "teacher-v"
)

// githubToken is injected at build time via ldflags:
//
//	wails build -ldflags "-X main.githubToken=ghp_xxxx"
//
// Never commit a real token value here.
var githubToken = ""

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Body    string `json:"body"`
}

// CheckForUpdate fetches GitHub Releases and emits "update:available"
// if a newer version tagged "teacher-vX.Y.Z" exists.
func (a *App) CheckForUpdate() {
	time.Sleep(8 * time.Second)

	apiURL := "https://api.github.com/repos/" + githubOwner + "/" + githubRepo + "/releases"
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		log.Printf("[Updater] 요청 생성 실패: %v", err)
		return
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "edulinker-teacher-app/"+AppVersion)
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
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[Updater] GitHub API 오류 (HTTP %d): %s", resp.StatusCode, string(body))
		return
	}

	var releases []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		log.Printf("[Updater] 응답 파싱 실패: %v", err)
		return
	}

	for _, rel := range releases {
		if !strings.HasPrefix(rel.TagName, githubTagPrefix) {
			continue
		}
		latestVer := strings.TrimPrefix(rel.TagName, "teacher-")
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
		return
	}
}

// GetAppVersion returns the current app version string.
func (a *App) GetAppVersion() string {
	return AppVersion
}

// OpenExternalURL opens a URL in the system default browser.
func (a *App) OpenExternalURL(rawURL string) {
	exec.Command("cmd", "/c", "start", "", rawURL).Start()
}

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
