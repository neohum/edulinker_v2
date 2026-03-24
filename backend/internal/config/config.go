package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all application configuration.
type Config struct {
	Server    ServerConfig
	Database  DatabaseConfig
	Redis     RedisConfig
	MinIO     MinIOConfig
	Wasabi    WasabiConfig
	JWT       JWTConfig
	CORS      CORSConfig
	RateLimit RateLimitConfig
	LogLevel  string
}

type CORSConfig struct {
	Origins string
}

type RateLimitConfig struct {
	AuthPerMin   int
	APIPerMin    int
	UploadPerMin int
}

type ServerConfig struct {
	Host string
	Port string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type JWTConfig struct {
	Secret          string
	ExpiryHours     int
	RefreshExpiryHr int
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
	DB       int
}

type MinIOConfig struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

type WasabiConfig struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Region    string
	Bucket    string
}

// DSN returns the PostgreSQL connection string.
func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.User, d.Password, d.DBName, d.SSLMode,
	)
}

// Load reads configuration from environment variables with defaults.
// It returns an error if essential configuration is missing.
func Load() (*Config, error) {
	// Try loading .env files in order of proximity
	godotenv.Load()
	godotenv.Load("../.env")
	godotenv.Load("../../.env")

	// Essential configuration check
	requiredEnvs := []string{"JWT_SECRET", "DB_PASSWORD"}
	for _, env := range requiredEnvs {
		if os.Getenv(env) == "" {
			return nil, fmt.Errorf("essential environment variable %s is missing", env)
		}
	}

	cfg := &Config{
		Server: ServerConfig{
			Host: getEnv("SERVER_HOST", "0.0.0.0"),
			Port: getEnv("SERVER_PORT", "8080"),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: os.Getenv("DB_PASSWORD"),
			DBName:   getEnv("DB_NAME", "edulinker"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       0,
		},
		MinIO: MinIOConfig{
			Endpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
			AccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
			SecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"), // Local dev default
			Bucket:    getEnv("MINIO_BUCKET", "edulinker-local"),
			UseSSL:    false,
		},
		Wasabi: WasabiConfig{
			Endpoint:  getEnv("WASABI_ENDPOINT", "s3.ap-northeast-1.wasabisys.com"),
			AccessKey: getEnv("WASABI_ACCESS_KEY", ""),
			SecretKey: getEnv("WASABI_SECRET_KEY", ""),
			Region:    getEnv("WASABI_REGION", "ap-northeast-1"),
			Bucket:    getEnv("WASABI_BUCKET", "edulinker"),
		},
		JWT: JWTConfig{
			Secret:          os.Getenv("JWT_SECRET"),
			ExpiryHours:     getEnvInt("JWT_EXPIRY_HOURS", 1),
			RefreshExpiryHr: getEnvInt("JWT_REFRESH_EXPIRY_HOURS", 168),
		},
		CORS: CORSConfig{
			Origins: getEnv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:8080"),
		},
		RateLimit: RateLimitConfig{
			AuthPerMin:   getEnvInt("RATE_LIMIT_AUTH", 5),
			APIPerMin:    getEnvInt("RATE_LIMIT_API", 60),
			UploadPerMin: getEnvInt("RATE_LIMIT_UPLOAD", 10),
		},
		LogLevel: getEnv("LOG_LEVEL", "info"),
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
