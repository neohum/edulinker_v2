package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"runtime"
	"strings"
)

// App struct holds the application state and context.
type App struct {
	ctx       context.Context
	apiBase   string
	authToken string
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{
		apiBase: "http://localhost:5200",
	}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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
	UserName     string `json:"user_name"`
	UserRole     string `json:"user_role"`
	SchoolName   string `json:"school_name"`
	Error        string `json:"error,omitempty"`
}

// Register registers a new user with the API server and signs them in.
func (a *App) Register(schoolCode, schoolName, name, phone, password, role string) LoginResult {
	body := fmt.Sprintf(`{"school_code":"%s","school_name":"%s","name":"%s","phone":"%s","password":"%s","role":"%s"}`, schoolCode, schoolName, name, phone, password, role)
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

	return LoginResult{
		Success:      true,
		Token:        a.authToken,
		RefreshToken: result["refresh_token"].(string),
		UserName:     user["name"].(string),
		UserRole:     user["role"].(string),
		SchoolName:   school["name"].(string),
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

	return LoginResult{
		Success:      true,
		Token:        a.authToken,
		RefreshToken: result["refresh_token"].(string),
		UserName:     user["name"].(string),
		UserRole:     user["role"].(string),
		SchoolName:   school["name"].(string),
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

	resp, err := http.DefaultClient.Do(req)
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

// SetAPIBase allows changing the API server URL.
func (a *App) SetAPIBase(url string) {
	a.apiBase = url
}
