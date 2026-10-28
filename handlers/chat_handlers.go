package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ChatHandler struct {
	repo repository.Repository
}

func NewChatHandler(repo repository.Repository) *ChatHandler {
	return &ChatHandler{repo: repo}
}

// CreateChatRequest maneja POST /api/v1/chats/requests (201 Created)
func (h *ChatHandler) CreateChatRequest(c *gin.Context) {
	senderID := c.GetString("user_id")

	var req models.CreateChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Destinatario y mensaje inicial requeridos",
		})
		return
	}

	// El destinatario puede llegar como UUID o como nombre de usuario ("kiba_dev", "u/kiba_dev", "@kiba_dev")
	recipient := strings.TrimSpace(req.RecipientUserID)
	if _, err := uuid.Parse(recipient); err != nil {
		username := strings.TrimPrefix(strings.TrimPrefix(recipient, "u/"), "@")
		user, err := h.repo.GetUserByUsername(username)
		if err != nil {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "NOT_FOUND",
				Message: "No existe el usuario u/" + username,
			})
			return
		}
		recipient = user.ID
	}
	req.RecipientUserID = recipient

	if senderID == req.RecipientUserID {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "No puedes enviarte una solicitud a ti mismo",
		})
		return
	}

	// Sanitización contra XSS
	req.InitialMessage = middleware.SanitizeText(req.InitialMessage)

	chatReq := &models.ChatRequest{
		SenderID:       senderID,
		RecipientID:    req.RecipientUserID,
		InitialMessage: req.InitialMessage,
	}

	if err := h.repo.CreateChatRequest(chatReq); err != nil {
		if strings.Contains(err.Error(), "bloqueado") || strings.Contains(err.Error(), "no puedes enviar") {
			c.JSON(http.StatusForbidden, models.ErrorResponse{
				Error:   "FORBIDDEN",
				Message: err.Error(),
			})
			return
		}
		if strings.Contains(err.Error(), "ya existe") {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error:   "CONFLICT",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: err.Error(),
		})
		return
	}

	notify(h.repo, chatReq.RecipientID, senderID, "Solicitud de chat",
		"u/"+c.GetString("username")+" quiere chatear contigo: «"+chatReq.InitialMessage+"»", notifChat)

	c.JSON(http.StatusCreated, chatReq)
}

// ListChatRequests maneja GET /api/v1/chats/requests (200 OK): solicitudes pendientes recibidas
func (h *ChatHandler) ListChatRequests(c *gin.Context) {
	userID := c.GetString("user_id")

	reqs, err := h.repo.ListIncomingChatRequests(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al recuperar solicitudes de chat",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": reqs,
		"count": len(reqs),
	})
}

// UpdateChatRequest maneja PATCH /api/v1/chats/requests/:id (200 OK)
func (h *ChatHandler) UpdateChatRequest(c *gin.Context) {
	userID := c.GetString("user_id")
	reqID := c.Param("id")

	chatReq, err := h.repo.GetChatRequestByID(reqID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Solicitud no encontrada",
		})
		return
	}

	// Solo el destinatario puede aceptar/rechazar/bloquear
	if chatReq.RecipientID != userID {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "No tienes permiso para responder a esta solicitud",
		})
		return
	}

	if chatReq.Status != models.ChatPending {
		c.JSON(http.StatusConflict, models.ErrorResponse{
			Error:   "CONFLICT",
			Message: "Esta solicitud ya fue respondida",
		})
		return
	}

	var actionReq models.UpdateChatActionRequest
	if err := c.ShouldBindJSON(&actionReq); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Acción inválida. Valores permitidos: ACCEPT, REJECT, BLOCK",
		})
		return
	}

	statusMap := map[string]string{
		"ACCEPT": models.ChatAccepted,
		"REJECT": models.ChatRejected,
		"BLOCK":  models.ChatBlocked,
	}
	dbStatus := statusMap[actionReq.Action]
	if dbStatus == "" {
		dbStatus = actionReq.Action
	}

	if err := h.repo.UpdateChatRequestStatus(reqID, dbStatus); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al actualizar solicitud",
		})
		return
	}

	if actionReq.Action == "BLOCK" {
		_ = h.repo.BlockUser(userID, chatReq.SenderID)
	}

	if actionReq.Action == "ACCEPT" {
		// Aceptar abre la conversación y la inicia con el mensaje de presentación
		conv, err := h.repo.GetOrCreateConversation(chatReq.SenderID, chatReq.RecipientID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{
				Error:   "INTERNAL_ERROR",
				Message: "Error al abrir la conversación",
			})
			return
		}
		notify(h.repo, chatReq.SenderID, userID, "Solicitud aceptada",
			"u/"+c.GetString("username")+" aceptó tu solicitud de chat", notifChat)
		if chatReq.InitialMessage != "" {
			_ = h.repo.CreateChatMessage(&models.ChatMessage{
				ConversationID: conv.ID,
				SenderID:       chatReq.SenderID,
				MessageText:    chatReq.InitialMessage,
			})
		}
		c.JSON(http.StatusOK, gin.H{
			"success":         true,
			"message":         "Solicitud aceptada",
			"conversation_id": conv.ID,
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Solicitud actualizada a " + actionReq.Action,
	})
}

// ListConversations maneja GET /api/v1/chats/conversations (200 OK)
func (h *ChatHandler) ListConversations(c *gin.Context) {
	userID := c.GetString("user_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	convs, err := h.repo.ListConversations(userID, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al recuperar conversaciones",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": convs,
		"count": len(convs),
	})
}

// ListMessages maneja GET /api/v1/chats/conversations/:id/messages (200 OK)
func (h *ChatHandler) ListMessages(c *gin.Context) {
	userID := c.GetString("user_id")
	convID := c.Param("id")
	beforeTimestamp := c.Query("before_timestamp")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	conv, err := h.repo.GetConversationByID(convID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Conversación no encontrada",
		})
		return
	}

	if conv.User1ID != userID && conv.User2ID != userID {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "No perteneces a esta conversación",
		})
		return
	}

	messages, err := h.repo.ListMessages(convID, beforeTimestamp, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al obtener mensajes",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conversation_id": convID,
		"messages":        messages,
	})
}

// SendMessage maneja POST /api/v1/chats/conversations/:id/messages (201 Created)
func (h *ChatHandler) SendMessage(c *gin.Context) {
	userID := c.GetString("user_id")
	convID := c.Param("id")

	conv, err := h.repo.GetConversationByID(convID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Conversación no encontrada",
		})
		return
	}

	if conv.User1ID != userID && conv.User2ID != userID {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "No tienes permiso para enviar mensajes en esta conversación",
		})
		return
	}

	var req models.SendChatMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Texto del mensaje requerido",
		})
		return
	}

	req.MessageText = middleware.SanitizeText(req.MessageText)

	msg := &models.ChatMessage{
		ConversationID: convID,
		SenderID:       userID,
		MessageText:    req.MessageText,
		AttachmentURL:  req.AttachmentURL,
	}

	if err := h.repo.CreateChatMessage(msg); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al enviar mensaje",
		})
		return
	}

	recipientID := conv.User1ID
	if recipientID == userID {
		recipientID = conv.User2ID
	}
	notify(h.repo, recipientID, userID, "Nuevo mensaje",
		"u/"+c.GetString("username")+" te envió un mensaje privado", notifChat)

	c.JSON(http.StatusCreated, msg)
}

// BlockUser maneja POST /api/v1/users/block (200 OK)
func (h *ChatHandler) BlockUser(c *gin.Context) {
	blockerID := c.GetString("user_id")

	var req models.BlockUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Identificador del usuario objetivo requerido",
		})
		return
	}

	if err := h.repo.BlockUser(blockerID, req.TargetUserID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Usuario bloqueado correctamente",
	})
}
