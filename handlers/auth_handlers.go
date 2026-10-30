package handlers

import (
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"forfunable/config"
	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	repo repository.Repository
	cfg  *config.Config
}

func NewAuthHandler(repo repository.Repository, cfg *config.Config) *AuthHandler {
	return &AuthHandler{repo: repo, cfg: cfg}
}

// setRefreshCookie emite la cookie refresh_token con HttpOnly y SameSite=Strict.
// Secure solo se activa en producción para permitir pruebas locales sobre http://localhost.
func (h *AuthHandler) setRefreshCookie(c *gin.Context, value string, maxAge int) {
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie("refresh_token", value, maxAge, "/", "", h.cfg.IsProduction(), true)
}

// validPassword: al menos 8 caracteres, una letra y un número (igual que el formulario)
func validPassword(pw string) bool {
	return len(pw) >= 8 && strings.ContainsAny(pw, "0123456789") && strings.ContainsFunc(pw, unicode.IsLetter)
}

// usernamePattern es la misma regla que valida el formulario de registro
var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)

// Register maneja POST /api/v1/auth/register (201 Created)
func (h *AuthHandler) Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Parámetros de registro inválidos: " + err.Error(),
		})
		return
	}

	if !usernamePattern.MatchString(req.Username) {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "UNPROCESSABLE_ENTITY",
			Message: "El nombre de usuario solo admite letras, números y guion bajo (_), sin espacios",
		})
		return
	}

	// Validación de contraseña (misma regla que muestra el formulario de registro)
	if !validPassword(req.Password) {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "UNPROCESSABLE_ENTITY",
			Message: "La contraseña debe tener al menos 8 caracteres, una letra y un número",
		})
		return
	}

	// Sanitización de entradas
	req.Username = middleware.SanitizeText(req.Username)

	// Hash seguro con bcrypt
	hashedPass, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Fallo al procesar credenciales",
		})
		return
	}

	user := &models.User{
		Username:     req.Username,
		Email:        strings.ToLower(strings.TrimSpace(req.Email)),
		PasswordHash: string(hashedPass),
		GlobalRole:   models.RoleUser,
		KarmaScore:   10,
		IsActive:     true,
	}

	if err := h.repo.CreateUser(user); err != nil {
		if strings.Contains(err.Error(), "ya se encuentra registrado") || strings.Contains(err.Error(), "ya está en uso") {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error:   "CONFLICT",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "No se pudo registrar el usuario: " + err.Error(),
		})
		return
	}

	accessToken, refreshToken, err := middleware.GenerateTokens(user.ID, user.Username, user.GlobalRole, h.cfg.JWTAccessTTL, h.cfg.JWTRefreshTTL, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al emitir tokens de sesión",
		})
		return
	}

	h.setRefreshCookie(c, refreshToken, int(h.cfg.JWTRefreshTTL.Seconds()))
	c.JSON(http.StatusCreated, models.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int64(h.cfg.JWTAccessTTL.Seconds()),
		User:         *user,
	})
}

// Login maneja POST /api/v1/auth/login (200 OK)
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Cuerpo de solicitud inválido",
		})
		return
	}

	user, err := h.repo.GetUserByEmail(strings.ToLower(strings.TrimSpace(req.Email)))
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "UNAUTHORIZED",
			Message: "Credenciales de acceso incorrectas",
		})
		return
	}

	if !user.IsActive {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "ACCOUNT_SUSPENDED",
			Message: "La cuenta está suspendida: " + user.FreezeReason,
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "UNAUTHORIZED",
			Message: "Credenciales de acceso incorrectas",
		})
		return
	}

	accessToken, refreshToken, err := middleware.GenerateTokens(user.ID, user.Username, user.GlobalRole, h.cfg.JWTAccessTTL, h.cfg.JWTRefreshTTL, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error generando token",
		})
		return
	}

	h.setRefreshCookie(c, refreshToken, int(h.cfg.JWTRefreshTTL.Seconds()))
	c.JSON(http.StatusOK, models.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int64(h.cfg.JWTAccessTTL.Seconds()),
		User:         *user,
	})
}

// Refresh maneja POST /api/v1/auth/refresh (200 OK)
func (h *AuthHandler) Refresh(c *gin.Context) {
	var tokenStr string
	var req models.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err == nil && req.RefreshToken != "" {
		tokenStr = req.RefreshToken
	}

	if tokenStr == "" {
		if cookie, err := c.Cookie("refresh_token"); err == nil {
			tokenStr = cookie
		}
	}

	if tokenStr == "" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "UNAUTHORIZED",
			Message: "Token de refresco requerido",
		})
		return
	}

	claims, err := middleware.ParseAndValidateToken(tokenStr, h.cfg.JWTSecret)
	if err != nil || claims.TokenType != "refresh" {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "UNAUTHORIZED",
			Message: "Token de refresco expirado o inválido",
		})
		return
	}

	user, err := h.repo.GetUserByID(claims.UserID)
	if err != nil || !user.IsActive {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "La sesión ya no es válida",
		})
		return
	}

	newAccessToken, newRefreshToken, err := middleware.GenerateTokens(user.ID, user.Username, user.GlobalRole, h.cfg.JWTAccessTTL, h.cfg.JWTRefreshTTL, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al renovar tokens",
		})
		return
	}

	h.setRefreshCookie(c, newRefreshToken, int(h.cfg.JWTRefreshTTL.Seconds()))
	c.JSON(http.StatusOK, models.AuthResponse{
		AccessToken:  newAccessToken,
		RefreshToken: newRefreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int64(h.cfg.JWTAccessTTL.Seconds()),
		User:         *user,
	})
}

// Logout maneja POST /api/v1/auth/logout (200 OK)
func (h *AuthHandler) Logout(c *gin.Context) {
	h.setRefreshCookie(c, "", -1)
	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Sesión cerrada correctamente",
	})
}

// GetMe maneja GET /api/v1/users/me (200 OK)
func (h *AuthHandler) GetMe(c *gin.Context) {
	userID := c.GetString("user_id")
	user, err := h.repo.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Usuario no encontrado",
		})
		return
	}
	c.JSON(http.StatusOK, user)
}

// UpdateProfile maneja PATCH /api/v1/users/me/profile (200 OK)
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Parámetros inválidos",
		})
		return
	}

	current, err := h.repo.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Usuario no encontrado",
		})
		return
	}

	// Los campos omitidos conservan su valor actual
	username, email, avatarURL, bio := current.Username, current.Email, current.AvatarURL, current.Bio
	if req.Username != nil {
		username = strings.TrimSpace(*req.Username)
	}
	if req.Email != nil {
		email = strings.ToLower(strings.TrimSpace(*req.Email))
	}
	if req.AvatarURL != nil {
		avatarURL = strings.TrimSpace(*req.AvatarURL)
	}
	if req.Bio != nil {
		bio = middleware.SanitizeText(strings.TrimSpace(*req.Bio))
	}

	if msg := validateProfile(username, email, avatarURL, bio); msg != "" {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "UNPROCESSABLE_ENTITY",
			Message: msg,
		})
		return
	}

	updated, err := h.repo.UpdateUserProfile(userID, username, email, avatarURL, bio)
	if err != nil {
		if strings.Contains(err.Error(), "ya está en uso") || strings.Contains(err.Error(), "ya se encuentra registrado") {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error:   "CONFLICT",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "No se pudo actualizar el perfil",
		})
		return
	}
	c.JSON(http.StatusOK, updated)
}

// validateProfile aplica las mismas reglas que el formulario de registro y de edición de perfil
func validateProfile(username, email, avatarURL, bio string) string {
	if len(username) < 3 || len(username) > 30 || !usernamePattern.MatchString(username) {
		return "El nombre de usuario debe tener entre 3 y 30 caracteres: letras, números y guion bajo (_)"
	}
	if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email || !strings.Contains(email[strings.LastIndex(email, "@"):], ".") {
		return "El correo electrónico no es válido"
	}
	if avatarURL != "" {
		u, err := url.Parse(avatarURL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || len(avatarURL) > 500 {
			return "La foto de perfil debe ser un enlace http(s) válido a una imagen"
		}
	}
	if len([]rune(bio)) > 300 {
		return "La biografía admite como máximo 300 caracteres"
	}
	return ""
}

// ChangePassword maneja PATCH /api/v1/users/me/password (200 OK)
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Escribe tu contraseña actual y la nueva",
		})
		return
	}

	user, err := h.repo.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Usuario no encontrado",
		})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)) != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "INVALID_CREDENTIALS",
			Message: "La contraseña actual no es correcta",
		})
		return
	}
	if !validPassword(req.NewPassword) {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "UNPROCESSABLE_ENTITY",
			Message: "La contraseña debe tener al menos 8 caracteres, una letra y un número",
		})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil || h.repo.UpdateUserPassword(userID, string(hash)) != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "No se pudo cambiar la contraseña",
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Contraseña actualizada",
	})
}

// UpdateStatus maneja PATCH /api/v1/users/me/status (200 OK)
func (h *AuthHandler) UpdateStatus(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Estado inválido. Valores permitidos: ONLINE, BUSY, OFFLINE",
		})
		return
	}

	if err := h.repo.UpdateUserStatus(userID, req.PresenceStatus); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error actualizando presencia",
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Estado de presencia actualizado a " + req.PresenceStatus,
	})
}

// VerifyAge maneja POST /api/v1/users/me/verify-age (200 OK)
func (h *AuthHandler) VerifyAge(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.VerifyAgeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Token de aserción IDP requerido",
		})
		return
	}

	if err := h.repo.VerifyUserAge(userID); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error validando mayoría de edad",
		})
		return
	}

	c.JSON(http.StatusOK, models.VerifyAgeResponse{
		Verified: true,
		Message:  "Mayoría de edad validada exitosamente mediante IDP",
	})
}

// GetPublicProfile maneja GET /api/v1/users/:id (200 OK)
func (h *AuthHandler) GetPublicProfile(c *gin.Context) {
	identifier := c.Param("id")
	user, err := h.repo.GetUserByUsername(identifier)
	if err != nil {
		user, err = h.repo.GetUserByID(identifier)
	}
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Usuario no encontrado",
		})
		return
	}

	// Devolver vista pública sin datos sensibles
	c.JSON(http.StatusOK, gin.H{
		"id":                user.ID,
		"username":          user.Username,
		"global_role":       user.GlobalRole,
		"avatar_url":        user.AvatarURL,
		"bio":               user.Bio,
		"presence_status":   user.PresenceStatus,
		"karma_score":       user.KarmaScore,
		"is_adult_verified": user.IsAdultVerified,
		"created_at":        user.CreatedAt,
	})
}
