package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port            string
	DatabaseURL     string
	RedisURL        string
	JWTSecret       string
	JWTAccessTTL    time.Duration
	JWTRefreshTTL   time.Duration
	Environment     string
	RecaptchaBypass bool
	StorageBucket   string
}

func LoadConfig() *Config {
	port := getEnv("PORT", "8080")
	dbURL := getEnv("DATABASE_URL", "")
	redisURL := getEnv("REDIS_URL", "")
	jwtSecret := getEnv("JWT_SECRET", "forfunable-secure-super-jwt-secret-key-2026")
	env := getEnv("APP_ENV", "development")
	bypassRecaptcha, _ := strconv.ParseBool(getEnv("RECAPTCHA_BYPASS", "true"))
	bucket := getEnv("GCS_BUCKET", "forfunable-media")

	return &Config{
		Port:            port,
		DatabaseURL:     dbURL,
		RedisURL:        redisURL,
		JWTSecret:       jwtSecret,
		JWTAccessTTL:    15 * time.Minute,
		JWTRefreshTTL:   7 * 24 * time.Hour,
		Environment:     env,
		RecaptchaBypass: bypassRecaptcha,
		StorageBucket:   bucket,
	}
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}
