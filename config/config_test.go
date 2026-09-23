package config

import (
	"strings"
	"testing"
)

// TestBuildDSN_CloudRunUnixSocket valida que en el escenario de Google Cloud Run
// se construye correctamente el DSN de socket Unix usando las 4 variables:
// INSTANCE_CONNECTION_NAME, DB_NAME, DB_USER y DB_PASSWORD,
// sin requerir ni exigir DATABASE_URL.
func TestBuildDSN_CloudRunUnixSocket(t *testing.T) {
	cfg := &Config{
		InstanceConnectionName: "proyecto-eval:us-central1:forfunable-sql",
		DBName:                 "forfunable_db",
		DBUser:                 "forfunable_user",
		DBPassword:             "SuperSecurePass123!",
		DatabaseURL:            "", // Explícitamente vacío, no debe ser requerido
	}

	dsn, err := cfg.BuildDSN()
	if err != nil {
		t.Fatalf("BuildDSN falló en escenario Cloud Run: %v", err)
	}

	expectedPrefix := "host=/cloudsql/proyecto-eval:us-central1:forfunable-sql"
	if !strings.Contains(dsn, expectedPrefix) {
		t.Errorf("DSN no contiene el socket host esperado. Obtenido: %s", dsn)
	}
	if !strings.Contains(dsn, "dbname=forfunable_db") {
		t.Errorf("DSN no contiene dbname esperado. Obtenido: %s", dsn)
	}
	if !strings.Contains(dsn, "user=forfunable_user") {
		t.Errorf("DSN no contiene user esperado. Obtenido: %s", dsn)
	}
	if !strings.Contains(dsn, "password=SuperSecurePass123!") {
		t.Errorf("DSN no contiene password esperado. Obtenido: %s", dsn)
	}
	if !strings.Contains(dsn, "sslmode=disable") {
		t.Errorf("DSN no contiene sslmode=disable. Obtenido: %s", dsn)
	}
}

// TestBuildDSN_CloudRunMissingFields valida que si falta alguna de las variables
// requeridas para el socket Unix de Cloud Run, se retorna un error claro.
func TestBuildDSN_CloudRunMissingFields(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr string
	}{
		{
			name: "Falta DB_PASSWORD",
			cfg: Config{
				InstanceConnectionName: "proj:reg:inst",
				DBName:                 "db",
				DBUser:                 "user",
				DBPassword:             "",
			},
			wantErr: "DB_PASSWORD es obligatorio",
		},
		{
			name: "Falta DB_NAME",
			cfg: Config{
				InstanceConnectionName: "proj:reg:inst",
				DBName:                 "",
				DBUser:                 "user",
				DBPassword:             "pass",
			},
			wantErr: "DB_NAME es obligatorio",
		},
		{
			name: "Falta DB_USER",
			cfg: Config{
				InstanceConnectionName: "proj:reg:inst",
				DBName:                 "db",
				DBUser:                 "",
				DBPassword:             "pass",
			},
			wantErr: "DB_USER es obligatorio",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := tt.cfg.BuildDSN()
			if err == nil {
				t.Fatalf("Se esperaba error conteniendo %q, pero fue nil", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Error obtenido %q no contiene %q", err.Error(), tt.wantErr)
			}
		})
	}
}

// TestBuildDSN_TCPLocal valida que para ejecución TCP fuera de Cloud Run
// se acepta DATABASE_URL directamente.
func TestBuildDSN_TCPLocal(t *testing.T) {
	expectedDSN := "postgres://forfunable_user:mypass@127.0.0.1:5432/forfunable_db?sslmode=disable"
	cfg := &Config{
		DatabaseURL:            expectedDSN,
		InstanceConnectionName: "", // Sin socket Unix
	}

	dsn, err := cfg.BuildDSN()
	if err != nil {
		t.Fatalf("BuildDSN falló en escenario TCP local: %v", err)
	}

	if dsn != expectedDSN {
		t.Errorf("DSN esperado: %s, obtenido: %s", expectedDSN, dsn)
	}
}

// TestBuildDSN_MissingAll valida que si ni DATABASE_URL ni INSTANCE_CONNECTION_NAME están presentes,
// se devuelve un error descriptivo indicando ambas alternativas.
func TestBuildDSN_MissingAll(t *testing.T) {
	cfg := &Config{
		DatabaseURL:            "",
		InstanceConnectionName: "",
	}

	_, err := cfg.BuildDSN()
	if err == nil {
		t.Fatal("Se esperaba error por configuración incompleta, pero fue nil")
	}
	if !strings.Contains(err.Error(), "DATABASE_URL") || !strings.Contains(err.Error(), "INSTANCE_CONNECTION_NAME") {
		t.Errorf("El error debe indicar ambas alternativas. Obtenido: %v", err)
	}
}
