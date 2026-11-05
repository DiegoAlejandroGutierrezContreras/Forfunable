package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ChatHandler struct {
	repo repository.Repository
	Ext  *repository.ExtendedRepository // opcional: entregado/leído, editar y eliminar (V004)
}

// Plazos al estilo WhatsApp
const (
	ChatEditWindow      = 15 * time.Minute // editar un mensaje propio
	ChatDeleteAllWindow = 48 * time.Hour   // eliminar para todos
)

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

	var convs []*models.ChatConversation
	var err error
	if h.Ext.Available() {
		// Abrir la bandeja confirma la entrega de lo recibido (doble marca gris)
		_ = h.Ext.MarkChatDelivered(userID)
		convs, err = h.Ext.ListChatConversations(userID)
	} else {
		convs, err = h.repo.ListConversations(userID, page, limit)
	}
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

	var messages []*models.ChatMessage
	if h.Ext.Available() {
		// Abrir la conversación marca como leído lo recibido (doble marca azul)
		_ = h.Ext.MarkChatRead(convID, userID)
		if limit <= 50 {
			limit = 200
		}
		messages, err = h.Ext.ListChatMessages(convID, userID, limit)
	} else {
		messages, err = h.repo.ListMessages(convID, beforeTimestamp, limit)
	}
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

	if h.Ext.Available() {
		msg.Status = "sent"
	}
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

// chatMessageForUser carga el mensaje y comprueba que quien llama participa en la conversación.
func (h *ChatHandler) chatMessageForUser(c *gin.Context) *repository.ChatMessageRef {
	if !h.Ext.Available() {
		extError(c, repository.ErrExtendedUnavailable, http.StatusServiceUnavailable)
		return nil
	}
	ref, err := h.Ext.GetChatMessageRef(c.Param("id"))
	if err != nil {
		extError(c, errors.New("mensaje no encontrado"), http.StatusNotFound)
		return nil
	}
	uid := c.GetString("user_id")
	if ref.User1ID != uid && ref.User2ID != uid {
		extError(c, errors.New("mensaje no encontrado"), http.StatusNotFound)
		return nil
	}
	return ref
}

// EditMessage maneja PATCH /api/v1/chats/messages/:id (200 OK): solo el remitente, durante 15 minutos.
func (h *ChatHandler) EditMessage(c *gin.Context) {
	ref := h.chatMessageForUser(c)
	if ref == nil {
		return
	}
	if ref.SenderID != c.GetString("user_id") {
		extError(c, errors.New("solo puedes editar tus propios mensajes"), http.StatusForbidden)
		return
	}
	if ref.Deleted {
		extError(c, errors.New("el mensaje fue eliminado"), http.StatusConflict)
		return
	}
	if time.Since(ref.CreatedAt) > ChatEditWindow {
		extError(c, errors.New("solo puedes editar un mensaje durante los primeros 15 minutos"), http.StatusForbidden)
		return
	}
	var req models.SendChatMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.MessageText) == "" {
		extError(c, errors.New("escribe el nuevo texto del mensaje"), http.StatusBadRequest)
		return
	}
	text := middleware.SanitizeText(req.MessageText)
	if len([]rune(text)) > 2000 {
		extError(c, errors.New("el mensaje admite máximo 2000 caracteres"), http.StatusBadRequest)
		return
	}
	editedAt, err := h.Ext.EditChatMessage(ref.ID, text)
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "id": ref.ID, "message_text": text, "edited_at": editedAt})
}

// DeleteMessage maneja DELETE /api/v1/chats/messages/:id?for=me|all (200 OK).
// "me" lo oculta solo para quien llama; "all" (solo el remitente, 48 h) lo borra para ambos.
func (h *ChatHandler) DeleteMessage(c *gin.Context) {
	ref := h.chatMessageForUser(c)
	if ref == nil {
		return
	}
	uid := c.GetString("user_id")
	switch c.DefaultQuery("for", "me") {
	case "me":
		if err := h.Ext.HideChatMessage(ref.ID, uid); err != nil {
			extError(c, err, http.StatusInternalServerError)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "scope": "me", "message": "Mensaje eliminado para ti"})
	case "all":
		if ref.SenderID != uid {
			extError(c, errors.New("solo puedes eliminar para todos tus propios mensajes"), http.StatusForbidden)
			return
		}
		if ref.Deleted {
			extError(c, errors.New("el mensaje ya fue eliminado"), http.StatusConflict)
			return
		}
		if time.Since(ref.CreatedAt) > ChatDeleteAllWindow {
			extError(c, errors.New("solo puedes eliminar para todos durante las primeras 48 horas; puedes eliminarlo para ti"), http.StatusForbidden)
			return
		}
		if err := h.Ext.DeleteChatMessageForAll(ref.ID); err != nil {
			extError(c, err, http.StatusInternalServerError)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "scope": "all", "message": "Mensaje eliminado para todos"})
	default:
		extError(c, errors.New("indica for=me o for=all"), http.StatusBadRequest)
	}
}

// UnreadCount maneja GET /api/v1/chats/unread (200 OK): mensajes sin leer.
// Al consultarlo, la app confirma la entrega de lo recibido (doble marca gris para el remitente).
func (h *ChatHandler) UnreadCount(c *gin.Context) {
	if !h.Ext.Available() {
		c.JSON(http.StatusOK, gin.H{"unread": 0})
		return
	}
	uid := c.GetString("user_id")
	_ = h.Ext.MarkChatDelivered(uid)
	n, err := h.Ext.UnreadChatCount(uid)
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"unread": n})
}
