package middleware

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"forfunable/models"
	"forfunable/services"
	"github.com/gin-gonic/gin"
)

// maxRecaptchaBodyBytes limita la lectura del cuerpo para extraer el token (protección contra cuerpos gigantes)
const maxRecaptchaBodyBytes = 1 << 20

// RequireRecaptcha valida el campo "recaptcha_token" del cuerpo JSON contra reCAPTCHA Enterprise
// antes de llegar al handler. El cuerpo se restaura para que el handler pueda volver a leerlo.
func RequireRecaptcha(verifier services.RecaptchaVerifier, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, err := io.ReadAll(io.LimitReader(c.Request.Body, maxRecaptchaBodyBytes))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, models.ErrorResponse{
				Error:   "BAD_REQUEST",
				Message: "No se pudo leer el cuerpo de la solicitud",
			})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(raw))

		var payload struct {
			RecaptchaToken string `json:"recaptcha_token"`
		}
		// Un JSON inválido lo rechaza el handler con su propio mensaje; aquí solo interesa el token.
		_ = json.Unmarshal(raw, &payload)

		if err := verifier.Verify(c.Request.Context(), payload.RecaptchaToken, action); err != nil {
			if errors.Is(err, services.ErrRecaptchaRejected) {
				c.AbortWithStatusJSON(http.StatusForbidden, models.ErrorResponse{
					Error:   "RECAPTCHA_FAILED",
					Message: "No se pudo verificar que la solicitud proviene de una persona. Intente de nuevo.",
				})
				return
			}
			log.Printf("[ERROR] reCAPTCHA Enterprise: %v", err)
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, models.ErrorResponse{
				Error:   "SERVICE_UNAVAILABLE",
				Message: "La verificación anti-bots no está disponible temporalmente",
			})
			return
		}

		c.Next()
	}
}
