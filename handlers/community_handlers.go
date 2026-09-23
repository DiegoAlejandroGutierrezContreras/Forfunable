package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

type CommunityHandler struct {
	repo repository.Repository
}

func NewCommunityHandler(repo repository.Repository) *CommunityHandler {
	return &CommunityHandler{repo: repo}
}

// ListCommunities maneja GET /api/v1/communities (200 OK)
func (h *CommunityHandler) ListCommunities(c *gin.Context) {
	search := c.Query("search")
	sortType := c.DefaultQuery("sort", "newest")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	comms, total, err := h.repo.ListCommunities(search, sortType, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al consultar comunidades",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": comms,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// CreateCommunity maneja POST /api/v1/communities (201 Created)
// Regla: Exige token de sesión y puntuación de karma de usuario igual o superior a 100 puntos
func (h *CommunityHandler) CreateCommunity(c *gin.Context) {
	userID := c.GetString("user_id")
	user, err := h.repo.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "UNAUTHORIZED",
			Message: "Usuario no autenticado",
		})
		return
	}

	// Validación de Karma mínimo de 100 puntos (excepto GLOBAL_ADMIN)
	if user.GlobalRole != models.RoleGlobalAdmin && user.KarmaScore < 100 {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "Se requiere un puntaje de karma igual o superior a 100 puntos para crear una comunidad",
		})
		return
	}

	var req models.CreateCommunityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Parámetros inválidos para crear la comunidad: " + err.Error(),
		})
		return
	}

	req.Name = middleware.SanitizeText(req.Name)
	req.Description = middleware.SanitizeText(req.Description)

	comm := &models.Community{
		Name:        req.Name,
		Description: req.Description,
		CreatorID:   user.ID,
	}

	if err := h.repo.CreateCommunity(comm); err != nil {
		if strings.Contains(err.Error(), "ya existe") {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error:   "CONFLICT",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "No se pudo registrar la comunidad",
		})
		return
	}

	c.JSON(http.StatusCreated, comm)
}

// GetCommunityDetail maneja GET /api/v1/communities/:name (200 OK)
func (h *CommunityHandler) GetCommunityDetail(c *gin.Context) {
	name := c.Param("name")
	comm, err := h.repo.GetCommunityByName(name)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Comunidad no encontrada",
		})
		return
	}

	mods, _ := h.repo.GetCommunityModerators(comm.ID)
	isMember := false
	if uid, exists := c.Get("user_id"); exists {
		isMember, _ = h.repo.IsCommunityMember(comm.ID, uid.(string))
	}

	c.JSON(http.StatusOK, models.CommunityDetailResponse{
		Community:  *comm,
		Moderators: mods,
		IsMember:   isMember,
	})
}

// JoinCommunity maneja POST /api/v1/communities/:id/join (200 OK)
func (h *CommunityHandler) JoinCommunity(c *gin.Context) {
	userID := c.GetString("user_id")
	commID := c.Param("id")

	// Verificar si está baneado
	banned, err := h.repo.IsUserBannedFromCommunity(userID, commID)
	if err == nil && banned {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "BANNED",
			Message: "Has sido sancionado en esta comunidad",
		})
		return
	}

	if err := h.repo.JoinCommunity(commID, userID); err != nil {
		if strings.Contains(err.Error(), "ya es miembro") {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error:   "CONFLICT",
				Message: err.Error(),
			})
			return
		}
		if strings.Contains(err.Error(), "no encontrada") {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "NOT_FOUND",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al suscribirse a la comunidad",
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Suscrito a la comunidad exitosamente",
	})
}

// LeaveCommunity maneja DELETE /api/v1/communities/:id/leave (200 OK)
func (h *CommunityHandler) LeaveCommunity(c *gin.Context) {
	userID := c.GetString("user_id")
	commID := c.Param("id")

	if err := h.repo.LeaveCommunity(commID, userID); err != nil {
		if strings.Contains(err.Error(), "no pertenece") || strings.Contains(err.Error(), "no encontrada") {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "NOT_FOUND",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al cancelar suscripción",
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Suscripción cancelada exitosamente",
	})
}
