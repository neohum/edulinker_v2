package registry

import (
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// mockPlugin implements the Plugin interface for testing.
type mockPlugin struct {
	id      string
	name    string
	group   string
	version string
}

func (m *mockPlugin) ID() string      { return m.id }
func (m *mockPlugin) Name() string    { return m.name }
func (m *mockPlugin) Group() string   { return m.group }
func (m *mockPlugin) Version() string { return m.version }
func (m *mockPlugin) RegisterRoutes(router fiber.Router) {
	router.Get("/test", func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})
}
func (m *mockPlugin) OnEnable(schoolID uuid.UUID) error  { return nil }
func (m *mockPlugin) OnDisable(schoolID uuid.UUID) error { return nil }

func TestNewManager(t *testing.T) {
	mgr := NewManager()
	if mgr == nil {
		t.Fatal("NewManager returned nil")
	}
	if len(mgr.All()) != 0 {
		t.Error("New manager should have no plugins")
	}
}

func TestRegisterAndGet(t *testing.T) {
	mgr := NewManager()
	p := &mockPlugin{id: "test-plugin", name: "Test", group: "A", version: "1.0.0"}

	mgr.Register(p)

	got, ok := mgr.Get("test-plugin")
	if !ok {
		t.Fatal("Get returned false for registered plugin")
	}
	if got.ID() != "test-plugin" {
		t.Errorf("ID = %q, want %q", got.ID(), "test-plugin")
	}
}

func TestGetNonExistent(t *testing.T) {
	mgr := NewManager()
	_, ok := mgr.Get("nonexistent")
	if ok {
		t.Error("Get should return false for unregistered plugin")
	}
}

func TestAllPlugins(t *testing.T) {
	mgr := NewManager()
	mgr.Register(&mockPlugin{id: "a", name: "A", group: "A", version: "1.0"})
	mgr.Register(&mockPlugin{id: "b", name: "B", group: "B", version: "1.0"})

	all := mgr.All()
	if len(all) != 2 {
		t.Errorf("All() returned %d plugins, want 2", len(all))
	}
}

func TestRegisterOverwrite(t *testing.T) {
	mgr := NewManager()
	mgr.Register(&mockPlugin{id: "dup", name: "First", group: "A", version: "1.0"})
	mgr.Register(&mockPlugin{id: "dup", name: "Second", group: "A", version: "2.0"})

	p, _ := mgr.Get("dup")
	if p.Name() != "Second" {
		t.Errorf("Name = %q, want %q (should overwrite)", p.Name(), "Second")
	}
}

func TestMountRoutes_NoPanic(t *testing.T) {
	mgr := NewManager()
	mgr.Register(&mockPlugin{id: "test", name: "Test", group: "A", version: "1.0"})

	app := fiber.New()
	api := app.Group("/api")

	// MountRoutes should not panic
	mgr.MountRoutes(api)
}
