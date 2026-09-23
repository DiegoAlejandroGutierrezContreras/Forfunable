package handlers

import (
	"net/http"
	"strconv"

	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

type NotificationHandler struct {
	repo repository.Repository
}

func NewNotificationHandler(repo repository.Repository) *NotificationHandler {
	return &NotificationHandler{repo: repo}
}

// ListNotifications maneja GET /api/v1/notifications (200 OK)
func (h *NotificationHandler) ListNotifications(c *gin.Context) {
	userID := c.GetString("user_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	notifs, err := h.repo.ListNotifications(userID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al recuperar notificaciones",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": notifs,
		"count": len(notifs),
	})
}

// MarkAsRead maneja PATCH /api/v1/notifications/:id/read (200 OK)
func (h *NotificationHandler) MarkAsRead(c *gin.Context) {
	userID := c.GetString("user_id")
	notifID := c.Param("id")

	if err := h.repo.MarkNotificationRead(notifID, userID); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Notificación no encontrada",
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Notificación marcada como leída",
	})
}

// GetSettings maneja GET /api/v1/notifications/settings (200 OK)
func (h *NotificationHandler) GetSettings(c *gin.Context) {
	userID := c.GetString("user_id")
	settings, err := h.repo.GetNotificationSettings(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al recuperar configuración",
		})
		return
	}

	c.JSON(http.StatusOK, settings)
}

// UpdateSettings maneja PUT /api/v1/notifications/settings (200 OK)
func (h *NotificationHandler) UpdateSettings(c *gin.Context) {
	userID := c.GetString("user_id")

	var req models.UpdateNotificationSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Cuerpo de solicitud inválido",
		})
		return
	}

	settings := &models.NotificationSettings{
		UserID:                userID,
		EmailOnReply:          req.EmailOnReply,
		EmailOnMention:        req.EmailOnMention,
		PushOnChatRequest:     req.PushOnChatRequest,
		PushOnCommunityUpdate: req.PushOnCommunityUpdate,
	}

	if err := h.repo.UpdateNotificationSettings(settings); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al guardar configuración",
		})
		return
	}

	c.JSON(http.StatusOK, settings)
}
