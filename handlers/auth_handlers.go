package handlers

import (
	"net/http"
	"strings"

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

	// Validación de contraseña
	if len(req.Password) < 8 {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "UNPROCESSABLE_ENTITY",
			Message: "La contraseña debe tener un mínimo de 8 caracteres",
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

	c.SetCookie("refresh_token", refreshToken, int(h.cfg.JWTRefreshTTL.Seconds()), "/", "", false, true)
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

	c.SetCookie("refresh_token", refreshToken, int(h.cfg.JWTRefreshTTL.Seconds()), "/", "", false, true)
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

	c.SetCookie("refresh_token", newRefreshToken, int(h.cfg.JWTRefreshTTL.Seconds()), "/", "", false, true)
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
	c.SetCookie("refresh_token", "", -1, "/", "", false, true)
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

	// Sanitización contra XSS
	req.Bio = middleware.SanitizeText(req.Bio)

	updated, err := h.repo.UpdateUserProfile(userID, req.AvatarURL, req.Bio)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "No se pudo actualizar el perfil",
		})
		return
	}
	c.JSON(http.StatusOK, updated)
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
