package tests

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"forfunable/middleware"
	"forfunable/services"
	"github.com/gin-gonic/gin"
)

func setupCSRFTestServer() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.CSRFProtection(false))
	r.GET("/api/v1/ping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	r.POST("/api/v1/auth/refresh", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	return r
}

func TestCSRF_IssuesCookieWithSameSiteStrict(t *testing.T) {
	router := setupCSRFTestServer()
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/ping", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	setCookie := w.Header().Get("Set-Cookie")
	if !strings.Contains(setCookie, middleware.CSRFCookieName+"=") {
		t.Fatalf("Esperada cookie csrf_token en la respuesta, recibido: %q", setCookie)
	}
	if !strings.Contains(setCookie, "SameSite=Strict") {
		t.Fatalf("La cookie csrf_token debe ser SameSite=Strict, recibido: %q", setCookie)
	}
	if strings.Contains(setCookie, "HttpOnly") {
		t.Fatalf("La cookie csrf_token debe ser legible por JS (sin HttpOnly), recibido: %q", setCookie)
	}
}

func TestCSRF_CookieAuthMutation(t *testing.T) {
	router := setupCSRFTestServer()

	cases := []struct {
		name       string
		header     string
		bearer     bool
		wantStatus int
	}{
		{"sin cabecera CSRF", "", false, http.StatusForbidden},
		{"cabecera CSRF incorrecta", "otro-valor", false, http.StatusForbidden},
		{"cabecera CSRF correcta", "token-valido", false, http.StatusOK},
		{"Bearer token exento", "", true, http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
			req.AddCookie(&http.Cookie{Name: "refresh_token", Value: "jwt-refresh"})
			req.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "token-valido"})
			if tc.header != "" {
				req.Header.Set(middleware.CSRFHeaderName, tc.header)
			}
			if tc.bearer {
				req.Header.Set("Authorization", "Bearer access-token")
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tc.wantStatus {
				t.Fatalf("Esperado %d, recibido %d, body: %s", tc.wantStatus, w.Code, w.Body.String())
			}
		})
	}
}

func TestCSRF_NoAmbientCredentialAllowed(t *testing.T) {
	// Clientes sin cookies (Bruno, móvil, tests) no necesitan cabecera CSRF
	router := setupCSRFTestServer()
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Esperado 200 sin credencial ambiental, recibido %d", w.Code)
	}
}

type fakeRecaptchaVerifier struct {
	err       error
	gotToken  string
	gotAction string
}

func (f *fakeRecaptchaVerifier) Verify(ctx context.Context, token, expectedAction string) error {
	f.gotToken = token
	f.gotAction = expectedAction
	return f.err
}

func TestRequireRecaptcha(t *testing.T) {
	cases := []struct {
		name       string
		verifyErr  error
		wantStatus int
	}{
		{"token aceptado", nil, http.StatusOK},
		{"token rechazado", services.ErrRecaptchaRejected, http.StatusForbidden},
		{"API no disponible", errors.New("timeout"), http.StatusServiceUnavailable},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			verifier := &fakeRecaptchaVerifier{err: tc.verifyErr}
			var handlerBody string

			r := gin.New()
			r.POST("/api/v1/auth/login", middleware.RequireRecaptcha(verifier, services.RecaptchaActionLogin), func(c *gin.Context) {
				raw, _ := io.ReadAll(c.Request.Body)
				handlerBody = string(raw)
				c.Status(http.StatusOK)
			})

			body := `{"email":"kiba@forfunable.com","password":"x","recaptcha_token":"tok-123"}`
			req, _ := http.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tc.wantStatus {
				t.Fatalf("Esperado %d, recibido %d, body: %s", tc.wantStatus, w.Code, w.Body.String())
			}
			if verifier.gotToken != "tok-123" || verifier.gotAction != services.RecaptchaActionLogin {
				t.Fatalf("Token/acción incorrectos enviados al verificador: %q / %q", verifier.gotToken, verifier.gotAction)
			}
			if tc.wantStatus == http.StatusOK && handlerBody != body {
				t.Fatalf("El handler debe recibir el cuerpo original intacto, recibido: %q", handlerBody)
			}
		})
	}
}
