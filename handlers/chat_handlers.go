package handlers

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
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
	if h.Ext.ChatReady() {
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
	if h.Ext.ChatReady() {
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
		"features": gin.H{
			"receipts":    h.Ext.ChatReady(),
			"edit_delete": h.Ext.ChatReady(),
			"replies":     h.Ext.MediaReady(),
			"attachments": h.Ext.MediaReady(),
			"max_file_mb": ChatMaxFileBytes >> 20,
		},
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
	if req.ReplyToID != "" && (!h.Ext.MediaReady() || !h.Ext.ReplyTargetOK(req.ReplyToID, convID)) {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "BAD_REQUEST", Message: "El mensaje al que respondes no existe en esta conversación"})
		return
	}
	if h.Ext.ChatReady() {
		req.AttachmentURL = "" // los adjuntos solo se crean con la subida de archivos
	}

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

	if h.Ext.ChatReady() {
		msg.Status = "sent"
	}
	if req.ReplyToID != "" {
		_ = h.Ext.SetReply(msg.ID, req.ReplyToID, convID)
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
	if !h.Ext.ChatReady() {
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
	if !h.Ext.ChatReady() {
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

// --- Adjuntos del chat (V005): fotos, GIF, vídeo, audio y documentos, como en WhatsApp ---

// ChatMaxFileBytes es el tamaño máximo de un adjunto
const ChatMaxFileBytes = 15 << 20

// Tipos admitidos por extensión → (tipo MIME servido, categoría). El contenido real se comprueba
// además con http.DetectContentType para que un ejecutable o HTML no pase por imagen.
var chatFileTypes = map[string][2]string{
	".jpg": {"image/jpeg", "image"}, ".jpeg": {"image/jpeg", "image"}, ".png": {"image/png", "image"},
	".webp": {"image/webp", "image"}, ".gif": {"image/gif", "gif"},
	".mp4": {"video/mp4", "video"}, ".webm": {"video/webm", "video"}, ".mov": {"video/quicktime", "video"},
	".mp3": {"audio/mpeg", "audio"}, ".ogg": {"audio/ogg", "audio"}, ".opus": {"audio/ogg", "audio"}, ".wav": {"audio/wav", "audio"},
	".m4a": {"audio/mp4", "audio"}, ".aac": {"audio/aac", "audio"}, ".weba": {"audio/webm", "audio"},
	".pdf": {"application/pdf", "file"}, ".txt": {"text/plain; charset=utf-8", "file"}, ".csv": {"text/csv; charset=utf-8", "file"},
	".md": {"text/markdown; charset=utf-8", "file"}, ".json": {"application/json", "file"},
	".doc": {"application/msword", "file"}, ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "file"},
	".xls": {"application/vnd.ms-excel", "file"}, ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "file"},
	".ppt": {"application/vnd.ms-powerpoint", "file"}, ".pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation", "file"},
	".odt": {"application/vnd.oasis.opendocument.text", "file"}, ".ods": {"application/vnd.oasis.opendocument.spreadsheet", "file"},
	".zip": {"application/zip", "file"}, ".rar": {"application/vnd.rar", "file"}, ".7z": {"application/x-7z-compressed", "file"},
}

// sniffMatches verifica que el contenido corresponde a la categoría declarada por la extensión.
func sniffMatches(kind, ext string, data []byte) bool {
	sniffed := http.DetectContentType(data)
	switch kind {
	case "image":
		return strings.HasPrefix(sniffed, "image/") && sniffed != "image/svg+xml"
	case "gif":
		return sniffed == "image/gif"
	case "video":
		return strings.HasPrefix(sniffed, "video/") || sniffed == "application/octet-stream" // .mov no siempre se detecta
	case "audio":
		return strings.HasPrefix(sniffed, "audio/") || sniffed == "application/ogg" || sniffed == "video/webm" || sniffed == "application/octet-stream"
	}
	// Documentos: se rechaza cualquier cosa que el navegador pudiera interpretar como página o script
	return !strings.HasPrefix(sniffed, "text/html") && !strings.HasPrefix(sniffed, "text/xml") && sniffed != "image/svg+xml" &&
		(ext != ".txt" && ext != ".csv" && ext != ".md" && ext != ".json" || strings.HasPrefix(sniffed, "text/plain") || strings.HasPrefix(sniffed, "application/json"))
}

func cleanFilename(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == '"' || r == '/' || r == '\\' || r == '<' || r == '>' {
			return '_'
		}
		return r
	}, name)
	if r := []rune(name); len(r) > 120 {
		ext := filepath.Ext(name)
		name = string(r[:120-len([]rune(ext))]) + ext
	}
	if name == "" || name == "." {
		name = "archivo"
	}
	return name
}

// UploadAttachment maneja POST /api/v1/chats/conversations/:id/attachments (201 Created).
// multipart/form-data: file (obligatorio), caption y reply_to_id (opcionales).
func (h *ChatHandler) UploadAttachment(c *gin.Context) {
	if !h.Ext.MediaReady() {
		extError(c, repository.ErrExtendedUnavailable, http.StatusServiceUnavailable)
		return
	}
	userID := c.GetString("user_id")
	convID := c.Param("id")
	conv, err := h.repo.GetConversationByID(convID)
	if err != nil || (conv.User1ID != userID && conv.User2ID != userID) {
		extError(c, errors.New("conversación no encontrada"), http.StatusNotFound)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, ChatMaxFileBytes+(1<<20))
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			c.JSON(http.StatusRequestEntityTooLarge, models.ErrorResponse{Error: "FILE_TOO_LARGE", Message: fmt.Sprintf("El archivo supera el máximo de %d MB", ChatMaxFileBytes>>20)})
			return
		}
		extError(c, fmt.Errorf("adjunta un archivo de hasta %d MB", ChatMaxFileBytes>>20), http.StatusBadRequest)
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, ChatMaxFileBytes+1))
	if err != nil || len(data) == 0 {
		extError(c, errors.New("no se pudo leer el archivo"), http.StatusBadRequest)
		return
	}
	if len(data) > ChatMaxFileBytes {
		c.JSON(http.StatusRequestEntityTooLarge, models.ErrorResponse{Error: "FILE_TOO_LARGE", Message: fmt.Sprintf("El archivo supera el máximo de %d MB", ChatMaxFileBytes>>20)})
		return
	}
	name := cleanFilename(header.Filename)
	ext := strings.ToLower(filepath.Ext(name))
	t, ok := chatFileTypes[ext]
	if !ok || !sniffMatches(t[1], ext, data) {
		c.JSON(http.StatusUnsupportedMediaType, models.ErrorResponse{Error: "UNSUPPORTED_FILE", Message: "Tipo de archivo no permitido. Puedes enviar fotos, GIF, vídeos, audios y documentos (PDF, Office, texto, ZIP)."})
		return
	}
	caption := middleware.SanitizeText(c.PostForm("caption"))
	if len([]rune(caption)) > 2000 {
		extError(c, errors.New("el texto admite máximo 2000 caracteres"), http.StatusBadRequest)
		return
	}
	replyTo := strings.TrimSpace(c.PostForm("reply_to_id"))
	if replyTo != "" && !h.Ext.ReplyTargetOK(replyTo, convID) {
		extError(c, errors.New("el mensaje al que respondes no existe en esta conversación"), http.StatusBadRequest)
		return
	}

	msg := &models.ChatMessage{ConversationID: convID, SenderID: userID, MessageText: caption}
	if err := h.repo.CreateChatMessage(msg); err != nil {
		extError(c, errors.New("error al enviar el archivo"), http.StatusInternalServerError)
		return
	}
	meta, err := h.Ext.SaveAttachment(msg.ID, userID, t[1], name, t[0], data)
	if err != nil {
		h.Ext.DeleteChatMessageHard(msg.ID)
		extError(c, errors.New("error al guardar el archivo"), http.StatusInternalServerError)
		return
	}
	if replyTo != "" {
		_ = h.Ext.SetReply(msg.ID, replyTo, convID)
	}
	msg.Attachment, msg.Status = meta, "sent"

	recipientID := conv.User1ID
	if recipientID == userID {
		recipientID = conv.User2ID
	}
	label := map[string]string{"image": "una foto", "gif": "un GIF", "video": "un vídeo", "audio": "un audio", "file": "un archivo"}[t[1]]
	notify(h.repo, recipientID, userID, "Nuevo mensaje", "u/"+c.GetString("username")+" te envió "+label, notifChat)
	c.JSON(http.StatusCreated, msg)
}

// DownloadAttachment maneja GET /api/v1/chats/attachments/:id: solo para los dos participantes.
func (h *ChatHandler) DownloadAttachment(c *gin.Context) {
	if !h.Ext.MediaReady() {
		extError(c, repository.ErrExtendedUnavailable, http.StatusServiceUnavailable)
		return
	}
	f, err := h.Ext.GetAttachment(c.Param("id"))
	uid := c.GetString("user_id")
	if err != nil || (f.User1ID != uid && f.User2ID != uid) {
		extError(c, errors.New("archivo no encontrado"), http.StatusNotFound)
		return
	}
	disposition := "attachment"
	if f.Kind != "file" && c.Query("download") != "1" {
		disposition = "inline"
	}
	// El archivo nunca se ejecuta como página: sandbox y sin scripts aunque se abra directamente
	c.Header("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox")
	c.Header("Cache-Control", "private, max-age=86400")
	c.Header("Content-Disposition", fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`, disposition, strings.ReplaceAll(f.Filename, `"`, "_"), urlPathEscape(f.Filename)))
	c.Data(http.StatusOK, f.MimeType, f.Data)
}

func urlPathEscape(s string) string {
	var b strings.Builder
	for _, by := range []byte(s) {
		if (by >= 'a' && by <= 'z') || (by >= 'A' && by <= 'Z') || (by >= '0' && by <= '9') || strings.IndexByte("-._~", by) >= 0 {
			b.WriteByte(by)
		} else {
			fmt.Fprintf(&b, "%%%02X", by)
		}
	}
	return b.String()
}
