package models

import (
	"time"

	"github.com/google/uuid"
)

// Role defines user roles in the system.
type Role string

const (
	RoleAdmin   Role = "admin"
	RoleTeacher Role = "teacher"
	RoleParent  Role = "parent"
	RoleStudent Role = "student"
)

// PluginStatus defines the lifecycle state of a plugin.
type PluginStatus string

const (
	PluginStatusActive   PluginStatus = "active"
	PluginStatusInactive PluginStatus = "inactive"
	PluginStatusBeta     PluginStatus = "beta"
	PluginStatusDev      PluginStatus = "dev"
)

// AccessLevel defines permission levels for plugin access.
type AccessLevel string

const (
	AccessRead  AccessLevel = "read"
	AccessWrite AccessLevel = "write"
	AccessAdmin AccessLevel = "admin"
)

// School represents a school entity.
type School struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	Name      string    `json:"name" gorm:"type:varchar(100);not null"`
	Code      string    `json:"code" gorm:"type:varchar(20);uniqueIndex;not null"`
	Address   string    `json:"address,omitempty" gorm:"type:varchar(255)"`
	Phone     string    `json:"phone,omitempty" gorm:"type:varchar(20)"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}

// User represents a system user (teacher, parent, student, admin).
type User struct {
	ID           uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	SchoolID     uuid.UUID `json:"school_id" gorm:"type:uuid;index"`
	Name         string    `json:"name" gorm:"type:varchar(50);not null"`
	LoginID      *string   `json:"login_id,omitempty" gorm:"type:varchar(50);uniqueIndex;default:null"`
	Phone        string    `json:"phone,omitempty" gorm:"type:varchar(20);index"`
	Email        string    `json:"email,omitempty" gorm:"type:varchar(100)"`
	Role         Role      `json:"role" gorm:"type:varchar(20);not null"`
	Grade        int       `json:"grade,omitempty" gorm:"type:int;default:0"`
	Class        int       `json:"class_num,omitempty" gorm:"type:int;default:0;column:class_num"`
	Number       int       `json:"number,omitempty" gorm:"type:int;default:0"`
	Gender       string    `json:"gender,omitempty" gorm:"type:varchar(10);default:''"`
	Department   string    `json:"department,omitempty" gorm:"type:varchar(50)"`
	TaskName     string    `json:"task_name,omitempty" gorm:"type:varchar(50)"`
	Position     string    `json:"position,omitempty" gorm:"type:varchar(50)"`
	ClassPhone   string    `json:"class_phone,omitempty" gorm:"type:varchar(20)"`
	ProfileImage string    `json:"profile_image,omitempty" gorm:"type:text"`
	PasswordHash string    `json:"-" gorm:"type:varchar(255)"`
	PIN          string    `json:"-" gorm:"type:varchar(255)"`                           // For student login
	ParentPhone  string    `json:"parent_phone,omitempty" gorm:"type:varchar(20);index"` // For parent auto-linking
	ParentPhone2 string    `json:"parent_phone2,omitempty" gorm:"type:varchar(20)"`      // Secondary parent phone
	IsActive     bool      `json:"is_active" gorm:"default:true"`
	CreatedAt    time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt    time.Time `json:"updated_at" gorm:"autoUpdateTime"`

	School School `json:"school,omitempty" gorm:"foreignKey:SchoolID"`
}

// RegisteredDevice represents a device authorized to access student content.
type RegisteredDevice struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	DeviceID  string    `json:"device_id" gorm:"type:varchar(100);uniqueIndex;not null"`
	SchoolID  uuid.UUID `json:"school_id" gorm:"type:uuid;index;not null"`
	Name      string    `json:"name" gorm:"type:varchar(100)"`
	IsActive  bool      `json:"is_active" gorm:"default:true"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime"`

	School School `json:"school,omitempty" gorm:"foreignKey:SchoolID"`
}

// Plugin defines a plugin available in the system.
type Plugin struct {
	ID          string       `json:"id" gorm:"type:varchar(50);primaryKey"`
	GroupCode   string       `json:"group_code" gorm:"type:char(1);not null"`
	Name        string       `json:"name" gorm:"type:varchar(100);not null"`
	Description string       `json:"description,omitempty" gorm:"type:text"`
	Version     string       `json:"version" gorm:"type:varchar(20);default:'1.0.0'"`
	Status      PluginStatus `json:"status" gorm:"type:varchar(20);default:'active'"`
	Icon        string       `json:"icon,omitempty" gorm:"type:varchar(50)"`
	CreatedAt   time.Time    `json:"created_at" gorm:"autoCreateTime"`
}

// SchoolPlugin tracks which plugins are enabled for each school.
type SchoolPlugin struct {
	SchoolID  uuid.UUID  `json:"school_id" gorm:"type:uuid;primaryKey"`
	PluginID  string     `json:"plugin_id" gorm:"type:varchar(50);primaryKey"`
	Enabled   bool       `json:"enabled" gorm:"default:false"`
	Config    string     `json:"config,omitempty" gorm:"type:jsonb;default:'{}'"`
	EnabledAt *time.Time `json:"enabled_at,omitempty"`

	School School `json:"school,omitempty" gorm:"foreignKey:SchoolID"`
	Plugin Plugin `json:"plugin,omitempty" gorm:"foreignKey:PluginID"`
}

// PluginPermission defines role-based access to a plugin.
type PluginPermission struct {
	PluginID    string      `json:"plugin_id" gorm:"type:varchar(50);primaryKey"`
	Role        Role        `json:"role" gorm:"type:varchar(20);primaryKey"`
	AccessLevel AccessLevel `json:"access_level" gorm:"type:varchar(20);default:'read'"`

	Plugin Plugin `json:"plugin,omitempty" gorm:"foreignKey:PluginID"`
}
