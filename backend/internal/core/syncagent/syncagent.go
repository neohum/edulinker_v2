package syncagent

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/edulinker/backend/internal/database/models"
	"gorm.io/gorm"
)

// SyncAgent manages the cloud relay pushing and pulling.
type SyncAgent struct {
	db        *gorm.DB
	syncURL   string
	providers map[string]SyncProvider
}

// SyncProvider allows plugins to provide data for the cloud cache.
type SyncProvider interface {
	GetSyncData(schoolID string) interface{} // returns JSON-marshalable struct/slice
	HandleEvent(payload string) error        // handle incoming events from cloud
}

var defaultSyncAgent *SyncAgent

func New(db *gorm.DB, url string) *SyncAgent {
	defaultSyncAgent = &SyncAgent{
		db:        db,
		syncURL:   url, // e.g. "http://localhost:8080/api/sync"
		providers: make(map[string]SyncProvider),
	}
	return defaultSyncAgent
}

func RegisterProvider(pluginID string, p SyncProvider) {
	if defaultSyncAgent != nil {
		defaultSyncAgent.providers[pluginID] = p
	}
}

// Start spawns the background worker
func (a *SyncAgent) Start() {
	go func() {
		// Wait a bit before first sync
		time.Sleep(5 * time.Second)
		for {
			a.performSync()
			// Sync every 15 seconds for testing, can be 1 minute in prod
			time.Sleep(15 * time.Second)
		}
	}()
}

func (a *SyncAgent) performSync() {
	var schools []models.School
	if err := a.db.Find(&schools).Error; err != nil {
		log.Printf("[SyncAgent] Error fetching schools: %v", err)
		return
	}

	for _, s := range schools {
		// 1. PUSH to Cloud
		a.pushSchoolData(s)

		// 2. POP from Cloud
		a.popSchoolEvents(s)
	}
}

func (a *SyncAgent) pushSchoolData(s models.School) {
	payload := make(map[string]interface{})
	for pid, provider := range a.providers {
		payload[pid] = provider.GetSyncData(s.ID.String())
	}

	dataBytes, _ := json.Marshal(payload)

	reqObj := map[string]string{
		"school_code": s.Code,
		"data_json":   string(dataBytes),
		"timestamp":   time.Now().Format(time.RFC3339),
	}

	reqBytes, _ := json.Marshal(reqObj)
	resp, err := http.Post(a.syncURL+"/push", "application/json", bytes.NewBuffer(reqBytes))
	if err != nil {
		log.Printf("[SyncAgent] Failed to push data for %s: %v", s.Code, err)
		return
	}
	defer resp.Body.Close()
}

func (a *SyncAgent) popSchoolEvents(s models.School) {
	resp, err := http.Get(a.syncURL + "/pop/" + s.Code)
	if err != nil || resp.StatusCode != 200 {
		return
	}
	defer resp.Body.Close()

	var events []struct {
		PluginID string `json:"plugin_id"`
		Payload  string `json:"payload"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return
	}

	for _, ev := range events {
		if p, ok := a.providers[ev.PluginID]; ok {
			p.HandleEvent(ev.Payload)
		}
	}
}
