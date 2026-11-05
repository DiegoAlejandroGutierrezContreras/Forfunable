package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// Funciones de cuenta: 01_07/06_89 sesiones activas, 06_90 exportación de datos,
// 06_86/06_74 eliminación de cuenta con periodo de gracia.

// DeletionGracePeriod es el plazo para arrepentirse antes de anonimizar la cuenta.
const DeletionGracePeriod = 14 * 24 * time.Hour

// extError responde 503 si la migración V003 no está aplicada; si no, el estado indicado.
func extError(c *gin.Context, err error, status int) {
	if errors.Is(err, repository.ErrExtendedUnavailable) {
		c.JSON(http.StatusServiceUnavailable, models.ErrorResponse{Error: "FEATURE_UNAVAILABLE", Message: err.Error()})
		return
	}
	code := map[int]string{http.StatusBadRequest: "BAD_REQUEST", http.StatusNotFound: "NOT_FOUND", http.StatusConflict: "CONFLICT", http.StatusForbidden: "FORBIDDEN"}[status]
	if code == "" {
		code = "INTERNAL_ERROR"
	}
	c.JSON(status, models.ErrorResponse{Error: code, Message: err.Error()})
}

// ListSessions maneja GET /api/v1/users/me/sessions (200 OK)
func (h *AuthHandler) ListSessions(c *gin.Context) {
	sessions, err := h.Ext.ListSessions(c.GetString("user_id"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	current := c.GetString("session_id")
	for _, s := range sessions {
		s.Current = s.ID == current
	}
	c.JSON(http.StatusOK, gin.H{"items": sessions, "count": len(sessions), "current_session_id": current})
}

// RevokeSession maneja DELETE /api/v1/users/me/sessions/:id (200 OK)
func (h *AuthHandler) RevokeSession(c *gin.Context) {
	sid := c.Param("id")
	n, err := h.Ext.RevokeSessions(c.GetString("user_id"), sid, "")
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	if n == 0 {
		extError(c, errors.New("sesión no encontrada"), http.StatusNotFound)
		return
	}
	if sid == c.GetString("session_id") {
		h.setRefreshCookie(c, "", -1)
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Sesión cerrada"})
}

// RevokeOtherSessions maneja POST /api/v1/users/me/sessions/revoke-others (200 OK):
// cierra el resto de dispositivos y rota la sesión actual (nuevo sid y nuevos tokens).
func (h *AuthHandler) RevokeOtherSessions(c *gin.Context) {
	userID := c.GetString("user_id")
	user, err := h.repo.GetUserByID(userID)
	if err != nil {
		extError(c, errors.New("usuario no encontrado"), http.StatusNotFound)
		return
	}
	n, err := h.Ext.RevokeSessions(userID, "", "")
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	access, refresh, err := h.sessionTokens(c, user, "")
	if err != nil {
		extError(c, errors.New("error al rotar la sesión"), http.StatusInternalServerError)
		return
	}
	h.setRefreshCookie(c, refresh, int(h.cfg.JWTRefreshTTL.Seconds()))
	other := n - 1
	if c.GetString("session_id") == "" || other < 0 {
		other = n
	}
	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"revoked":        other,
		"message":        fmt.Sprintf("Se cerraron %d sesiones y se renovaron las credenciales de este dispositivo", other),
		"access_token":   access,
		"refresh_token":  refresh,
		"token_type":     "Bearer",
		"expires_in":     int64(h.cfg.JWTAccessTTL.Seconds()),
		"user":           user,
		"rotated_at_utc": time.Now().UTC(),
	})
}

// ExportData maneja GET /api/v1/users/me/export (200 OK, descarga JSON)
func (h *AuthHandler) ExportData(c *gin.Context) {
	userID := c.GetString("user_id")
	data, err := h.Ext.ExportUserData(userID)
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	counts := gin.H{}
	for k, v := range data {
		if rows, ok := v.([]map[string]interface{}); ok {
			counts[k] = len(rows)
		}
	}
	payload := gin.H{
		"format":      "forfunable-export/v1",
		"exported_at": time.Now().UTC(),
		"user_id":     userID,
		"counts":      counts,
		"data":        data,
	}
	if c.Query("summary") == "1" {
		c.JSON(http.StatusOK, gin.H{"counts": counts, "exported_at": payload["exported_at"]})
		return
	}
	body, _ := json.MarshalIndent(payload, "", "  ")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="forfunable-datos-%s.json"`, time.Now().Format("2006-01-02")))
	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

// GetDeletion maneja GET /api/v1/users/me/deletion (200 OK): eliminación pendiente o null
func (h *AuthHandler) GetDeletion(c *gin.Context) {
	d, err := h.Ext.GetDeletion(c.GetString("user_id"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deletion": d, "grace_days": int(DeletionGracePeriod.Hours() / 24)})
}

// RequestDeletion maneja POST /api/v1/users/me/deletion (202 Accepted):
// doble confirmación (nombre de usuario + contraseña), cierra todas las sesiones.
func (h *AuthHandler) RequestDeletion(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.DeleteAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		extError(c, errors.New("escribe tu nombre de usuario y tu contraseña para confirmar"), http.StatusBadRequest)
		return
	}
	user, err := h.repo.GetUserByID(userID)
	if err != nil {
		extError(c, errors.New("usuario no encontrado"), http.StatusNotFound)
		return
	}
	if !strings.EqualFold(strings.TrimSpace(req.ConfirmUsername), user.Username) {
		extError(c, errors.New("el nombre de usuario no coincide"), http.StatusBadRequest)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "INVALID_CREDENTIALS", Message: "La contraseña no es correcta"})
		return
	}
	d, err := h.Ext.ScheduleDeletion(userID, middleware.SanitizeText(req.Reason), time.Now().Add(DeletionGracePeriod))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	_, _ = h.Ext.RevokeSessions(userID, "", "")
	h.setRefreshCookie(c, "", -1)
	c.JSON(http.StatusAccepted, gin.H{"success": true, "deletion": d, "message": "Eliminación programada"})
}

// CancelDeletion maneja DELETE /api/v1/users/me/deletion (200 OK)
func (h *AuthHandler) CancelDeletion(c *gin.Context) {
	ok, err := h.Ext.CancelDeletion(c.GetString("user_id"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	if !ok {
		extError(c, errors.New("no hay ninguna eliminación pendiente"), http.StatusNotFound)
		return
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Eliminación cancelada: tu cuenta sigue activa"})
}
