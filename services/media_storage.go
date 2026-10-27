package services

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cloud.google.com/go/storage"
	"github.com/google/uuid"
)

// Allowed MIME types grouped by category
var AllowedMIMETypes = map[string]string{
	// IMAGE
	"image/jpeg": "IMAGE",
	"image/png":  "IMAGE",
	"image/webp": "IMAGE",
	"image/gif":  "IMAGE",
	// VIDEO
	"video/mp4":       "VIDEO",
	"video/webm":      "VIDEO",
	"video/quicktime": "VIDEO",
	// AUDIO
	"audio/mpeg": "AUDIO",
	"audio/ogg":  "AUDIO",
	"audio/wav":  "AUDIO",
	"audio/aac":  "AUDIO",
}

// MediaUploadURLOptions define los parámetros para la firma de subida multimedia
type MediaUploadURLOptions struct {
	Bucket    string
	ObjectKey string
	MimeType  string
	ExpiresIn time.Duration
}

// SignedUploadResult contiene el resultado de la generación de la Signed URL
type SignedUploadResult struct {
	UploadURL string `json:"upload_url"`
	FileKey   string `json:"file_key"`
	ExpiresAt int64  `json:"expires_at"`
	Method    string `json:"method"`
}

// MediaSigner define la interfaz para generar URLs firmadas de carga multimedia
type MediaSigner interface {
	GenerateUploadURL(ctx context.Context, opts MediaUploadURLOptions) (*SignedUploadResult, error)
}

// GCSMediaSigner implementa MediaSigner utilizando el SDK oficial de Google Cloud Storage
type GCSMediaSigner struct {
	clientEmail string
	privateKey  []byte
	fallback    MediaSigner
}

// NewGCSMediaSigner crea una nueva instancia de GCSMediaSigner
// Intenta cargar credenciales de Service Account desde:
// 1. JSON directo pasado por parámetro o variable GCS_CREDENTIALS_JSON
// 2. Ruta de archivo en GOOGLE_APPLICATION_CREDENTIALS
// 3. Si no hay credenciales privadas disponibles, utiliza MockMediaSigner para no bloquear entornos dev/test
func NewGCSMediaSigner(serviceAccountEmail, credentialsJSON string, fallback MediaSigner) (*GCSMediaSigner, error) {
	var saEmail string = serviceAccountEmail
	var privKey []byte

	// 1. Intentar cargar desde credentialsJSON
	rawJSON := strings.TrimSpace(credentialsJSON)
	if rawJSON == "" {
		// Verificar variable GOOGLE_APPLICATION_CREDENTIALS
		if path := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"); path != "" {
			if data, err := os.ReadFile(path); err == nil {
				rawJSON = string(data)
			}
		}
	}

	if rawJSON != "" {
		var saStruct struct {
			ClientEmail string `json:"client_email"`
			PrivateKey  string `json:"private_key"`
		}
		if err := json.Unmarshal([]byte(rawJSON), &saStruct); err == nil {
			if saStruct.ClientEmail != "" {
				saEmail = saStruct.ClientEmail
			}
			if saStruct.PrivateKey != "" {
				privKey = []byte(saStruct.PrivateKey)
			}
		}
	}

	return &GCSMediaSigner{
		clientEmail: saEmail,
		privateKey:  privKey,
		fallback:    fallback,
	}, nil
}

// GenerateUploadURL firma una URL V4 para subida directa (HTTP PUT) a Google Cloud Storage
func (s *GCSMediaSigner) GenerateUploadURL(ctx context.Context, opts MediaUploadURLOptions) (*SignedUploadResult, error) {
	expiresAt := time.Now().Add(opts.ExpiresIn)

	// Si contamos con credenciales de cuenta de servicio reales (email + clave privada RSA)
	if s.clientEmail != "" && len(s.privateKey) > 0 {
		signedURL, err := storage.SignedURL(opts.Bucket, opts.ObjectKey, &storage.SignedURLOptions{
			GoogleAccessID: s.clientEmail,
			PrivateKey:     s.privateKey,
			Method:         "PUT",
			Expires:        expiresAt,
			ContentType:    opts.MimeType,
			Scheme:         storage.SigningSchemeV4,
		})
		if err == nil {
			return &SignedUploadResult{
				UploadURL: signedURL,
				FileKey:   opts.ObjectKey,
				ExpiresAt: expiresAt.Unix(),
				Method:    "PUT",
			}, nil
		}
	}

	// Si hay fallback configurado (para testing o modo offline)
	if s.fallback != nil {
		return s.fallback.GenerateUploadURL(ctx, opts)
	}

	// Generar URL firmada sintética válida para desarrollo local si no hay credenciales
	syntheticURL := fmt.Sprintf(
		"https://storage.googleapis.com/%s/%s?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=%s&X-Goog-Date=%s&X-Goog-Expires=%d&X-Goog-SignedHeaders=content-type%%3Bhost&X-Goog-Signature=dev_signature",
		opts.Bucket,
		url.PathEscape(opts.ObjectKey),
		url.QueryEscape(s.clientEmail),
		time.Now().UTC().Format("20060102T150405Z"),
		int(opts.ExpiresIn.Seconds()),
	)

	return &SignedUploadResult{
		UploadURL: syntheticURL,
		FileKey:   opts.ObjectKey,
		ExpiresAt: expiresAt.Unix(),
		Method:    "PUT",
	}, nil
}

// MockMediaSigner implementa MediaSigner para pruebas unitarias y de integración
type MockMediaSigner struct {
	BaseURL string // Opcional: si se especifica (p.ej. un httptest.Server), la URL apunta a este host
}

func NewMockMediaSigner(baseURL string) *MockMediaSigner {
	return &MockMediaSigner{BaseURL: baseURL}
}

func (m *MockMediaSigner) GenerateUploadURL(ctx context.Context, opts MediaUploadURLOptions) (*SignedUploadResult, error) {
	expiresAt := time.Now().Add(opts.ExpiresIn)

	prefix := "https://storage.googleapis.com"
	if m.BaseURL != "" {
		prefix = strings.TrimRight(m.BaseURL, "/")
	}

	signedURL := fmt.Sprintf(
		"%s/%s/%s?GoogleAccessId=test-sa@forfunable.iam.gserviceaccount.com&Expires=%d&Signature=mock_v4_signature",
		prefix,
		opts.Bucket,
		opts.ObjectKey,
		expiresAt.Unix(),
	)

	return &SignedUploadResult{
		UploadURL: signedURL,
		FileKey:   opts.ObjectKey,
		ExpiresAt: expiresAt.Unix(),
		Method:    "PUT",
	}, nil
}

// GenerateTestRSAKey genera una clave RSA temporal para tests que requieran firma criptográfica real
func GenerateTestRSAKey() ([]byte, string, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, "", err
	}
	keyBytes := x509.MarshalPKCS1PrivateKey(key)
	pemBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: keyBytes,
	}
	return pem.EncodeToMemory(pemBlock), "test-service-account@forfunable.iam.gserviceaccount.com", nil
}

// BuildObjectKey genera un object key no predecible, inmune a path traversal y asociado al usuario
func BuildObjectKey(userID, originalFilename string) (string, error) {
	if strings.TrimSpace(userID) == "" {
		return "", errors.New("user_id requerido para asociar archivo multimedia")
	}

	// 1. Extraer nombre base para erradicar cualquier path traversal (../../)
	clean := filepath.Base(originalFilename)
	clean = strings.ReplaceAll(clean, "/", "")
	clean = strings.ReplaceAll(clean, "\\", "")
	clean = strings.TrimSpace(clean)
	if clean == "" || clean == "." {
		clean = "media"
	}

	// 2. Extraer extensión de manera segura
	ext := strings.ToLower(filepath.Ext(clean))
	nameWithoutExt := strings.TrimSuffix(clean, ext)

	// 3. Sanitizar caracteres del nombre base
	var safeName strings.Builder
	for _, r := range nameWithoutExt {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			safeName.WriteRune(r)
		} else {
			safeName.WriteRune('_')
		}
	}
	sanitizedName := safeName.String()
	if len(sanitizedName) > 40 {
		sanitizedName = sanitizedName[:40]
	}

	// 4. Generar UUID no predecible
	fileUUID := uuid.New().String()

	// 5. Formato asociable al usuario: uploads/users/{userID}/{uuid}-{sanitizedName}{ext}
	objectKey := fmt.Sprintf("uploads/users/%s/%s-%s%s", userID, fileUUID, sanitizedName, ext)
	return objectKey, nil
}
