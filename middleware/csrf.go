package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"

	"forfunable/models"
	"github.com/gin-gonic/gin"
)

const (
	CSRFCookieName = "csrf_token"
	CSRFHeaderName = "X-CSRF-Token"
	// Mismo TTL que el refresh token (7 días)
	csrfCookieMaxAge = 7 * 24 * 60 * 60
)

// CSRFProtection implementa el patrón "double-submit cookie":
//   - Si el navegador no tiene la cookie csrf_token, se emite una (legible por JS, SameSite=Strict).
//   - Las mutaciones (POST, PUT, PATCH, DELETE) autenticadas por cookie deben enviar la cabecera
//     X-CSRF-Token con el mismo valor que la cookie.
//
// Solo se exige cuando la credencial es ambiental (cookie refresh_token) y no hay cabecera Authorization:
// un Bearer token nunca lo adjunta el navegador automáticamente, por lo que no es explotable vía CSRF.
// Así clientes sin cookies (Bruno, apps móviles, tests) siguen funcionando sin cambios.
func CSRFProtection(secureCookies bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		cookieToken, err := c.Cookie(CSRFCookieName)
		if err != nil || cookieToken == "" {
			cookieToken = newCSRFToken()
			if cookieToken != "" {
				c.SetSameSite(http.SameSiteStrictMode)
				c.SetCookie(CSRFCookieName, cookieToken, csrfCookieMaxAge, "/", "", secureCookies, false)
			}
		}

		if isSafeMethod(c.Request.Method) || c.GetHeader("Authorization") != "" {
			c.Next()
			return
		}

		if _, err := c.Cookie("refresh_token"); err != nil {
			// Sin credencial ambiental no hay nada que un sitio externo pueda abusar
			c.Next()
			return
		}

		headerToken := c.GetHeader(CSRFHeaderName)
		if headerToken == "" || subtle.ConstantTimeCompare([]byte(headerToken), []byte(cookieToken)) != 1 {
			c.AbortWithStatusJSON(http.StatusForbidden, models.ErrorResponse{
				Error:   "CSRF_TOKEN_INVALID",
				Message: "Falta la cabecera X-CSRF-Token o no coincide con la cookie csrf_token",
			})
			return
		}

		c.Next()
	}
}

func isSafeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

func newCSRFToken() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return ""
	}
	return hex.EncodeToString(buf)
}
