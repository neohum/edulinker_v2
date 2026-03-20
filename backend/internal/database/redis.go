package database

import (
	"context"
	"fmt"
	"log"

	"github.com/edulinker/backend/internal/config"
	"github.com/redis/go-redis/v9"
)

// ConnectRedis establishes a connection to Redis.
func ConnectRedis(cfg config.RedisConfig) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	log.Println("✅ Connected to Redis")
	return client, nil
}
