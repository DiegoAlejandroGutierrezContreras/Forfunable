package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"forfunable/config"
	"forfunable/handlers"
	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"forfunable/services"
	"github.com/gin-gonic/gin"
)

// setupMediaTestServer crea un servidor de prueba dedicado con un signer mockeable/configurable
func setupMediaTestServer(signer services.MediaSigner) (*gin.Engine, string) {
	gin.SetMode(gin.TestMode)
	cfg := config.LoadConfig()
	repo := repository.NewMemoryRepository()

	r := gin.New()
	r.Use(gin.Recovery())

	postHandler := handlers.NewPostHandler(repo, signer, "forfunable-media")

	v1 := r.Group("/api/v1")
	{
		posts := v1.Group("/posts")
		posts.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			posts.POST("/media-upload-url", postHandler.MediaUploadURL)
		}
	}

	userToken, _, _ := middleware.GenerateTokens(
		"a0000000-0000-0000-0000-000000000003",
		"kiba_dev",
		models.RoleUser,
		time.Hour,
		24*time.Hour,
		cfg.JWTSecret,
	)

	return r, userToken
}

// TestMediaUploadURL_MIMETypes valida todos los formatos multimedia aceptados (IMAGE, VIDEO, AUDIO)
func TestMediaUploadURL_MIMETypes(t *testing.T) {
	mockSigner := services.NewMockMediaSigner("")
	router, token := setupMediaTestServer(mockSigner)

	validCases := []struct {
		mimeType string
		filename string
	}{
		// IMAGE
		{"image/jpeg", "avatar.jpg"},
		{"image/png", "screenshot.png"},
		{"image/webp", "photo.webp"},
		{"image/gif", "animation.gif"},
		// VIDEO
		{"video/mp4", "clip.mp4"},
		{"video/webm", "recording.webm"},
		{"video/quicktime", "movie.mov"},
		// AUDIO
		{"audio/mpeg", "podcast.mp3"},
		{"audio/ogg", "track.ogg"},
		{"audio/wav", "sample.wav"},
		{"audio/aac", "voice.aac"},
	}

	for _, tc := range validCases {
		t.Run("Valid_"+tc.mimeType, func(t *testing.T) {
			reqBody := models.MediaUploadURLRequest{
				Filename: tc.filename,
				MimeType: tc.mimeType,
				FileSize: 1024 * 100, // 100 KB
			}
			jsonBody, _ := json.Marshal(reqBody)

			req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/media-upload-url", bytes.NewBuffer(jsonBody))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("Esperado 200 OK para %s, obtenido: %d. Respuesta: %s", tc.mimeType, w.Code, w.Body.String())
			}

			var resp models.MediaUploadURLResponse
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("Error deserializando respuesta: %v", err)
			}

			if resp.UploadURL == "" {
				t.Errorf("UploadURL no debe estar vacía")
			}
			if resp.FileKey == "" {
				t.Errorf("FileKey no debe estar vacía")
			}
			if !strings.Contains(resp.FileKey, "a0000000-0000-0000-0000-000000000003") {
				t.Errorf("FileKey debe asociarse al usuario autenticado, obtenido: %s", resp.FileKey)
			}
			if resp.ExpiresAt <= time.Now().Unix() {
				t.Errorf("ExpiresAt debe ser futuro")
			}
		})
	}
}

// TestMediaUploadURL_UnsupportedMIME valida rechazo con 415 para tipos no soportados
func TestMediaUploadURL_UnsupportedMIME(t *testing.T) {
	mockSigner := services.NewMockMediaSigner("")
	router, token := setupMediaTestServer(mockSigner)

	invalidCases := []string{
		"application/pdf",
		"application/x-sh",
		"text/html",
		"application/javascript",
		"application/zip",
		"application/octet-stream",
	}

	for _, mime := range invalidCases {
		t.Run("Reject_"+mime, func(t *testing.T) {
			reqBody := models.MediaUploadURLRequest{
				Filename: "malicious.bin",
				MimeType: mime,
				FileSize: 1024,
			}
			jsonBody, _ := json.Marshal(reqBody)

			req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/media-upload-url", bytes.NewBuffer(jsonBody))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusUnsupportedMediaType {
				t.Fatalf("Esperado 415 Unsupported Media Type para %s, obtenido: %d", mime, w.Code)
			}
		})
	}
}

// TestMediaUploadURL_FileSizeValidation valida límites mínimo y máximo de archivo
func TestMediaUploadURL_FileSizeValidation(t *testing.T) {
	mockSigner := services.NewMockMediaSigner("")
	router, token := setupMediaTestServer(mockSigner)

	// Caso 1: Tamaño <= 0
	t.Run("ZeroFileSize", func(t *testing.T) {
		reqBody := models.MediaUploadURLRequest{
			Filename: "empty.jpg",
			MimeType: "image/jpeg",
			FileSize: 0,
		}
		jsonBody, _ := json.Marshal(reqBody)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/media-upload-url", bytes.NewBuffer(jsonBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Esperado 400 Bad Request para tamaño 0, obtenido: %d", w.Code)
		}
	})

	// Caso 2: Tamaño > 50MB (52,428,801 bytes)
	t.Run("ExceedsMaxSize", func(t *testing.T) {
		reqBody := models.MediaUploadURLRequest{
			Filename: "huge_video.mp4",
			MimeType: "video/mp4",
			FileSize: 50*1024*1024 + 1,
		}
		jsonBody, _ := json.Marshal(reqBody)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/media-upload-url", bytes.NewBuffer(jsonBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Esperado 400 Bad Request para archivo > 50MB, obtenido: %d", w.Code)
		}
	})
}

// TestMediaUploadURL_Security valida autenticación y mitigación de Path Traversal
func TestMediaUploadURL_Security(t *testing.T) {
	mockSigner := services.NewMockMediaSigner("")
	router, token := setupMediaTestServer(mockSigner)

	// 1. Sin Token -> 401 Unauthorized
	t.Run("UnauthorizedWithoutToken", func(t *testing.T) {
		reqBody := models.MediaUploadURLRequest{
			Filename: "photo.jpg",
			MimeType: "image/jpeg",
			FileSize: 1024,
		}
		jsonBody, _ := json.Marshal(reqBody)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/media-upload-url", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("Esperado 401 Unauthorized, obtenido: %d", w.Code)
		}
	})

	// 2. Intento de Path Traversal en filename
	t.Run("PreventPathTraversal", func(t *testing.T) {
		traversalNames := []string{
			"../../../../etc/passwd",
			"..\\..\\windows\\system32\\calc.exe",
			"/var/log/secret.png",
			"../../../image.webp",
		}

		for _, fname := range traversalNames {
			reqBody := models.MediaUploadURLRequest{
				Filename: fname,
				MimeType: "image/webp",
				FileSize: 2048,
			}
			jsonBody, _ := json.Marshal(reqBody)

			req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/media-upload-url", bytes.NewBuffer(jsonBody))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("Esperado 200 OK con sanitización, obtenido: %d", w.Code)
			}

			var resp models.MediaUploadURLResponse
			_ = json.Unmarshal(w.Body.Bytes(), &resp)

			// Verificar que no contenga .. en la clave
			if strings.Contains(resp.FileKey, "..") {
				t.Errorf("Path traversal detectado en file_key: %s", resp.FileKey)
			}
			// Debe estar contenido estrictamente en uploads/users/
			if !strings.HasPrefix(resp.FileKey, "uploads/users/a0000000-0000-0000-0000-000000000003/") {
				t.Errorf("FileKey no cumple prefijo seguro: %s", resp.FileKey)
			}
		}
	})
}

// TestMediaUpload_IntegrationFlow prueba el flujo completo de obtención de URL y subida real HTTP PUT a GCS
func TestMediaUpload_IntegrationFlow(t *testing.T) {
	var uploadedBytes []byte
	var uploadedContentType string

	// 1. Levantar servidor mock que simula el bucket de Cloud Storage recibiendo la subida HTTP PUT
	gcsStorageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "Método no permitido", http.StatusMethodNotAllowed)
			return
		}
		data, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Error leyendo cuerpo", http.StatusInternalServerError)
			return
		}
		uploadedBytes = data
		uploadedContentType = r.Header.Get("Content-Type")

		// GCS responde 200 OK en subida PUT exitosa
		w.WriteHeader(http.StatusOK)
	}))
	defer gcsStorageServer.Close()

	// 2. Configurar PostHandler con MockMediaSigner apuntando al servidor mock de GCS
	mockSigner := services.NewMockMediaSigner(gcsStorageServer.URL)
	router, token := setupMediaTestServer(mockSigner)

	// 3. Solicitar URL firmada para un video MP4
	reqBody := models.MediaUploadURLRequest{
		Filename: "clip_viral.mp4",
		MimeType: "video/mp4",
		FileSize: 1024 * 512,
	}
	jsonBody, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/posts/media-upload-url", bytes.NewBuffer(jsonBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Esperado 200 OK de media-upload-url, obtenido: %d", w.Code)
	}

	var uploadResp models.MediaUploadURLResponse
	if err := json.Unmarshal(w.Body.Bytes(), &uploadResp); err != nil {
		t.Fatalf("Error deserializando respuesta: %v", err)
	}

	if !strings.HasPrefix(uploadResp.UploadURL, gcsStorageServer.URL) {
		t.Fatalf("La URL firmada no apunta al endpoint de almacenamiento configurado: %s", uploadResp.UploadURL)
	}

	// 4. El cliente sube directamente el archivo al bucket mediante HTTP PUT sin pasar por Cloud Run
	simulatedVideoPayload := []byte("SIMULATED_MP4_BINARY_DATA_CHUNK_TEST")
	putReq, err := http.NewRequest(http.MethodPut, uploadResp.UploadURL, bytes.NewReader(simulatedVideoPayload))
	if err != nil {
		t.Fatalf("Error creando petición PUT a GCS: %v", err)
	}
	putReq.Header.Set("Content-Type", "video/mp4")

	client := &http.Client{Timeout: 5 * time.Second}
	putResp, err := client.Do(putReq)
	if err != nil {
		t.Fatalf("Error ejecutando subida directa PUT a GCS: %v", err)
	}
	defer putResp.Body.Close()

	if putResp.StatusCode != http.StatusOK {
		t.Fatalf("Esperado 200 OK en subida a GCS, obtenido: %d", putResp.StatusCode)
	}

	if string(uploadedBytes) != string(simulatedVideoPayload) {
		t.Errorf("El contenido subido a GCS no coincide con el payload enviado")
	}

	if uploadedContentType != "video/mp4" {
		t.Errorf("Content-Type no coincide, esperado video/mp4, obtenido: %s", uploadedContentType)
	}
}

// TestGCSMediaSigner_RealRSA V4 valida la generación criptográfica de URLs firmadas V4 con clave RSA real
func TestGCSMediaSigner_RealRSA(t *testing.T) {
	keyPEM, saEmail, err := services.GenerateTestRSAKey()
	if err != nil {
		t.Fatalf("Error generando clave RSA de prueba: %v", err)
	}

	saJSON := map[string]string{
		"client_email": saEmail,
		"private_key":  string(keyPEM),
	}
	saJSONBytes, _ := json.Marshal(saJSON)

	signer, err := services.NewGCSMediaSigner(saEmail, string(saJSONBytes), nil)
	if err != nil {
		t.Fatalf("Error inicializando GCSMediaSigner: %v", err)
	}

	res, err := signer.GenerateUploadURL(context.Background(), services.MediaUploadURLOptions{
		Bucket:    "forfunable-media",
		ObjectKey: "uploads/users/test-uuid/media.png",
		MimeType:  "image/png",
		ExpiresIn: 15 * time.Minute,
	})
	if err != nil {
		t.Fatalf("Error generando Signed URL real con RSA: %v", err)
	}

	if !strings.HasPrefix(res.UploadURL, "https://storage.googleapis.com/forfunable-media/") {
		t.Errorf("URL firmada V4 inválida: %s", res.UploadURL)
	}

	// Verificar componentes estándar de V4 signing
	if !strings.Contains(res.UploadURL, "X-Goog-Algorithm=GOOG4-RSA-SHA256") {
		t.Errorf("Falta algoritmo GOOG4-RSA-SHA256 en la URL firmada: %s", res.UploadURL)
	}
	if !strings.Contains(res.UploadURL, "X-Goog-Signature=") {
		t.Errorf("Falta firma X-Goog-Signature en la URL firmada: %s", res.UploadURL)
	}
	if res.Method != "PUT" {
		t.Errorf("Esperado método PUT, obtenido: %s", res.Method)
	}
}
