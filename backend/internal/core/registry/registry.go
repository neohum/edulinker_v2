package registry

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// Plugin is the interface that all edulinker plugins must implement.
type Plugin interface {
	// ID returns the unique identifier of the plugin (e.g., "messenger").
	ID() string

	// Name returns the display name (e.g., "교사 메신저").
	Name() string

	// Group returns the group code (A~I).
	Group() string

	// Version returns the semantic version string.
	Version() string

	// RegisterRoutes mounts the plugin's HTTP routes on the given router.
	// The router is already scoped to /api/plugins/{pluginID}/.
	RegisterRoutes(router fiber.Router)

	// OnEnable is called when a school enables this plugin.
	OnEnable(schoolID uuid.UUID) error

	// OnDisable is called when a school disables this plugin.
	OnDisable(schoolID uuid.UUID) error
}

// Manager manages plugin registration and route mounting.
type Manager struct {
	plugins map[string]Plugin
}

// NewManager creates a new plugin manager.
func NewManager() *Manager {
	return &Manager{
		plugins: make(map[string]Plugin),
	}
}

// Register adds a plugin to the manager.
func (m *Manager) Register(p Plugin) {
	m.plugins[p.ID()] = p
}

// Get returns a plugin by ID.
func (m *Manager) Get(id string) (Plugin, bool) {
	p, ok := m.plugins[id]
	return p, ok
}

// All returns all registered plugins.
func (m *Manager) All() map[string]Plugin {
	return m.plugins
}

// MountRoutes creates a route group for each plugin under /api/plugins/{id}.
func (m *Manager) MountRoutes(app *fiber.App) {
	pluginsGroup := app.Group("/api/plugins")
	for id, p := range m.plugins {
		group := pluginsGroup.Group("/" + id)
		p.RegisterRoutes(group)
	}
}
