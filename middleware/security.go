package middleware

import (
	"html"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// ContentSecurityPolicy construye la CSP del SPA servido por Go (frontend/).
// Sin 'unsafe-inline' ni 'unsafe-eval' en scripts: el SPA no usa manejadores en línea
// (delegación data-on-*) y solo carga scripts propios y, si está activo, reCAPTCHA Enterprise.
// Los estilos en línea (atributo style) sí se permiten: no ejecutan código.
func ContentSecurityPolicy(production bool) string {
	directives := []string{
		"default-src 'self'",
		"script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"font-src 'self' https://fonts.gstatic.com",
		// Avatares y medios de las publicaciones son enlaces https externos elegidos por los usuarios
		"img-src 'self' data: blob: https:",
		"media-src 'self' https:",
		"connect-src 'self' https://www.google.com/recaptcha/",
		"frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
		"worker-src 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	}
	if production {
		directives = append(directives, "upgrade-insecure-requests")
	}
	return strings.Join(directives, "; ")
}

// SecurityHeaders agrega cabeceras defensivas para Cloud Run y clientes web/móvil
func SecurityHeaders(csp string) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		// X-XSS-Protection está obsoleto y puede introducir fallos; la CSP lo sustituye
		h.Set("X-XSS-Protection", "0")
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if csp != "" {
			h.Set("Content-Security-Policy", csp)
		}
		c.Next()
	}
}

// CORSPolicy decide qué orígenes externos pueden llamar a la API con credenciales.
// El SPA se sirve desde el mismo origen que la API, así que no necesita CORS.
type CORSPolicy struct {
	AllowedOrigins []string // orígenes exactos, p. ej. https://forfunable-web-xxxx.run.app
	AllowLocalhost bool     // solo fuera de producción: http://localhost:* y http://127.0.0.1:*
}

// Allows indica si el origen puede leer respuestas con credenciales.
func (p CORSPolicy) Allows(origin string) bool {
	if origin == "" || origin == "null" {
		return false
	}
	for _, o := range p.AllowedOrigins {
		if strings.EqualFold(strings.TrimRight(o, "/"), origin) {
			return true
		}
	}
	if p.AllowLocalhost {
		u, err := url.Parse(origin)
		if err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Path == "" {
			host := u.Hostname()
			return host == "localhost" || host == "127.0.0.1" || host == "::1"
		}
	}
	return false
}

// CORSMiddleware refleja únicamente orígenes de la lista blanca (nunca "*" con credenciales).
// Las peticiones sin Origin (mismo origen en GET, Bruno, apps móviles) no reciben cabeceras CORS.
func CORSMiddleware(policy CORSPolicy) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		h := c.Writer.Header()
		h.Add("Vary", "Origin")
		allowed := policy.Allows(origin)
		if allowed {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Authorization, Accept, Cache-Control, X-Requested-With")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Max-Age", "600")
		}

		// Preflight: se responde aquí; un origen no permitido no recibe cabeceras y el navegador lo bloquea
		if c.Request.Method == http.MethodOptions && c.Request.Header.Get("Access-Control-Request-Method") != "" {
			if allowed {
				c.AbortWithStatus(http.StatusNoContent)
			} else {
				c.AbortWithStatus(http.StatusForbidden)
			}
			return
		}

		c.Next()
	}
}

// SanitizeText previene inyecciones de código malicioso XSS sanitizando texto
func SanitizeText(input string) string {
	cleaned := html.EscapeString(strings.TrimSpace(input))
	return cleaned
}
