package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config contiene la configuración completa de la aplicación.
// Todos los valores sensibles deben inyectarse mediante variables de entorno
// (Google Secret Manager en producción, .env en desarrollo local).
type Config struct {
	Port                   string
	DatabaseURL            string
	InstanceConnectionName string // INSTANCE_CONNECTION_NAME para Cloud SQL socket Unix
	DBName                 string
	DBUser                 string
	DBPassword             string
	RedisURL               string
	JWTSecret              string
	JWTAccessTTL           time.Duration
	JWTRefreshTTL          time.Duration
	Environment            string
	GINMode                string
	RecaptchaBypass        bool
	StorageBucket          string
}

// LoadConfig carga la configuración desde variables de entorno.
// En producción (APP_ENV=production):
//   - JWT_SECRET es obligatorio.
//   - DATABASE_URL o INSTANCE_CONNECTION_NAME son obligatorios.
//
// La aplicación NO lee archivos .env directamente; usa las variables ya inyectadas.
func LoadConfig() *Config {
	port := getEnv("PORT", "8080")
	dbURL := os.Getenv("DATABASE_URL")
	instanceConnName := os.Getenv("INSTANCE_CONNECTION_NAME")
	dbName := getEnv("DB_NAME", "forfunable")
	dbUser := getEnv("DB_USER", "appuser")
	dbPassword := os.Getenv("DB_PASSWORD")
	redisURL := os.Getenv("REDIS_URL")
	jwtSecret := os.Getenv("JWT_SECRET")
	env := getEnv("APP_ENV", "development")
	ginMode := getEnv("GIN_MODE", "debug")
	bypassRecaptcha, _ := strconv.ParseBool(getEnv("RECAPTCHA_BYPASS", "true"))
	bucket := getEnv("GCS_BUCKET", "forfunable-media")

	// En producción el JWT_SECRET es obligatorio.
	// En desarrollo se permite un valor por defecto (NO usar en producción).
	if jwtSecret == "" {
		if env == "production" {
			fmt.Fprintln(os.Stderr, "[FATAL] JWT_SECRET es obligatorio en producción. Configure el secreto mediante Secret Manager.")
			os.Exit(1)
		}
		// Valor de desarrollo local únicamente. Cloud Run no debe llegar aquí.
		jwtSecret = "dev-only-jwt-secret-change-in-production"
	}

	return &Config{
		Port:                   port,
		DatabaseURL:            dbURL,
		InstanceConnectionName: instanceConnName,
		DBName:                 dbName,
		DBUser:                 dbUser,
		DBPassword:             dbPassword,
		RedisURL:               redisURL,
		JWTSecret:              jwtSecret,
		JWTAccessTTL:           15 * time.Minute,
		JWTRefreshTTL:          7 * 24 * time.Hour,
		Environment:            env,
		GINMode:                ginMode,
		RecaptchaBypass:        bypassRecaptcha,
		StorageBucket:          bucket,
	}
}

// getEnv devuelve el valor de la variable de entorno o el valor por defecto.
func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}

// BuildDSN construye el Data Source Name para PostgreSQL según el entorno:
//  1. Modo Cloud Run (Socket Unix): Si INSTANCE_CONNECTION_NAME está definido,
//     utiliza INSTANCE_CONNECTION_NAME, DB_NAME, DB_USER y DB_PASSWORD para armar:
//     "host=/cloudsql/<INSTANCE_CONNECTION_NAME> dbname=<DB_NAME> user=<DB_USER> password=<DB_PASSWORD> sslmode=disable"
//     En este modo NO se requiere DATABASE_URL.
//  2. Modo TCP Local / Desarrollo: Si no hay INSTANCE_CONNECTION_NAME, utiliza DATABASE_URL directamente.
func (c *Config) BuildDSN() (string, error) {
	// Modo 1: Cloud SQL via Unix Domain Socket (Cloud Run)
	if c.InstanceConnectionName != "" {
		if c.DBName == "" {
			return "", fmt.Errorf("DB_NAME es obligatorio cuando se usa INSTANCE_CONNECTION_NAME")
		}
		if c.DBUser == "" {
			return "", fmt.Errorf("DB_USER es obligatorio cuando se usa INSTANCE_CONNECTION_NAME")
		}
		if c.DBPassword == "" {
			return "", fmt.Errorf("DB_PASSWORD es obligatorio cuando se usa INSTANCE_CONNECTION_NAME")
		}
		dsn := fmt.Sprintf(
			"host=/cloudsql/%s dbname=%s user=%s password=%s sslmode=disable",
			c.InstanceConnectionName, c.DBName, c.DBUser, c.DBPassword,
		)
		return dsn, nil
	}

	// Modo 2: Conexión TCP directa (desarrollo local / tests)
	if c.DatabaseURL != "" {
		return c.DatabaseURL, nil
	}

	return "", fmt.Errorf("configuración de base de datos incompleta: especifique DATABASE_URL (modo TCP local) o INSTANCE_CONNECTION_NAME + DB_NAME + DB_USER + DB_PASSWORD (modo Cloud Run Unix socket)")
}
