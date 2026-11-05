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

func setupCORSTestServer(policy middleware.CORSPolicy) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.CORSMiddleware(policy))
	r.Use(middleware.SecurityHeaders(middleware.ContentSecurityPolicy(true)))
	r.GET("/api/v1/ping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	return r
}

func TestCORS_NeverWildcardWithCredentials(t *testing.T) {
	prod := middleware.CORSPolicy{AllowedOrigins: []string{"https://web.forfunable.app"}}
	cases := []struct {
		name, origin string
		policy       middleware.CORSPolicy
		wantACAO     string
	}{
		{"origen de la lista blanca", "https://web.forfunable.app", prod, "https://web.forfunable.app"},
		{"origen malicioso", "https://evil.example", prod, ""},
		{"sufijo engañoso", "https://web.forfunable.app.evil.example", prod, ""},
		{"localhost bloqueado en producción", "http://localhost:3000", prod, ""},
		{"localhost permitido en desarrollo", "http://localhost:3000", middleware.CORSPolicy{AllowLocalhost: true}, "http://localhost:3000"},
		{"origen null", "null", middleware.CORSPolicy{AllowLocalhost: true}, ""},
		{"sin Origin (mismo origen, Bruno)", "", prod, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodGet, "/api/v1/ping", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			w := httptest.NewRecorder()
			setupCORSTestServer(tc.policy).ServeHTTP(w, req)
			acao := w.Header().Get("Access-Control-Allow-Origin")
			if acao == "*" {
				t.Fatal("Access-Control-Allow-Origin nunca debe ser *")
			}
			if acao != tc.wantACAO {
				t.Fatalf("ACAO = %q, se esperaba %q", acao, tc.wantACAO)
			}
			if creds := w.Header().Get("Access-Control-Allow-Credentials"); (creds == "true") != (tc.wantACAO != "") {
				t.Fatalf("Allow-Credentials = %q con ACAO %q", creds, acao)
			}
		})
	}
}

func TestCORS_PreflightRejectsUnknownOrigin(t *testing.T) {
	r := setupCORSTestServer(middleware.CORSPolicy{AllowedOrigins: []string{"https://web.forfunable.app"}})
	for origin, want := range map[string]int{"https://web.forfunable.app": http.StatusNoContent, "https://evil.example": http.StatusForbidden} {
		req, _ := http.NewRequest(http.MethodOptions, "/api/v1/ping", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != want {
			t.Fatalf("preflight desde %s: estado %d, se esperaba %d", origin, w.Code, want)
		}
	}
}

func TestSecurityHeaders_StrictCSP(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/ping", nil)
	w := httptest.NewRecorder()
	setupCORSTestServer(middleware.CORSPolicy{}).ServeHTTP(w, req)
	csp := w.Header().Get("Content-Security-Policy")
	var scriptSrc string
	for _, d := range strings.Split(csp, ";") {
		if d = strings.TrimSpace(d); strings.HasPrefix(d, "script-src") {
			scriptSrc = d
		}
	}
	if scriptSrc == "" || strings.Contains(scriptSrc, "unsafe-inline") || strings.Contains(scriptSrc, "unsafe-eval") {
		t.Fatalf("script-src debe existir y no permitir unsafe-inline/unsafe-eval: %q", scriptSrc)
	}
	for _, d := range []string{"default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"} {
		if !strings.Contains(csp, d) {
			t.Fatalf("falta %q en la CSP: %s", d, csp)
		}
	}
	if !strings.Contains(w.Header().Get("Strict-Transport-Security"), "max-age=31536000") {
		t.Fatal("falta HSTS")
	}
}
