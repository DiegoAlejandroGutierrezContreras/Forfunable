package handlers

import (
	"fmt"
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

type PostHandler struct {
	repo repository.Repository
}

func NewPostHandler(repo repository.Repository) *PostHandler {
	return &PostHandler{repo: repo}
}

// ListPosts maneja GET /api/v1/posts (200 OK)
func (h *PostHandler) ListPosts(c *gin.Context) {
	communityID := c.Query("community_id")
	sortType := c.DefaultQuery("sort", "newest")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	posts, total, err := h.repo.ListPosts(communityID, sortType, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al listar publicaciones",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": posts,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// CreatePost maneja POST /api/v1/posts (201 Created)
func (h *PostHandler) CreatePost(c *gin.Context) {
	userID := c.GetString("user_id")

	var req models.CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Datos de publicación inválidos: " + err.Error(),
		})
		return
	}

	// Verificar ban en la comunidad
	banned, err := h.repo.IsUserBannedFromCommunity(userID, req.CommunityID)
	if err == nil && banned {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "BANNED",
			Message: "Has sido sancionado en esta comunidad",
		})
		return
	}

	// Sanitización contra XSS
	req.Title = middleware.SanitizeText(req.Title)
	req.BodyText = middleware.SanitizeText(req.BodyText)

	post := &models.Post{
		CommunityID: req.CommunityID,
		AuthorID:    userID,
		Title:       req.Title,
		ContentType: req.ContentType,
		BodyText:    req.BodyText,
		MediaURL:    req.MediaURL,
	}

	if err := h.repo.CreatePost(post); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "No se pudo registrar la publicación: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, post)
}

// GetPostDetail maneja GET /api/v1/posts/:id (200 OK)
func (h *PostHandler) GetPostDetail(c *gin.Context) {
	postID := c.Param("id")
	post, err := h.repo.GetPostByID(postID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Publicación no encontrada",
		})
		return
	}

	c.JSON(http.StatusOK, post)
}

// UpdatePost maneja PATCH /api/v1/posts/:id (200 OK)
// Regla: Exclusivo para el autor de la publicación
func (h *PostHandler) UpdatePost(c *gin.Context) {
	userID := c.GetString("user_id")
	postID := c.Param("id")

	post, err := h.repo.GetPostByID(postID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Publicación no encontrada",
		})
		return
	}

	if post.AuthorID != userID {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "Solo el autor original puede editar esta publicación",
		})
		return
	}

	var req models.UpdatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Contenido requerido",
		})
		return
	}

	req.BodyText = middleware.SanitizeText(req.BodyText)
	updated, err := h.repo.UpdatePost(postID, req.BodyText)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al actualizar publicación",
		})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// DeletePost maneja DELETE /api/v1/posts/:id (200 OK)
// Regla: Autor original
func (h *PostHandler) DeletePost(c *gin.Context) {
	userID := c.GetString("user_id")
	postID := c.Param("id")

	post, err := h.repo.GetPostByID(postID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Publicación no encontrada",
		})
		return
	}

	if post.AuthorID != userID {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "Solo el autor original puede eliminar esta publicación",
		})
		return
	}

	if err := h.repo.DeletePost(postID); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al eliminar publicación",
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Publicación eliminada correctamente",
	})
}

// MediaUploadURL maneja POST /api/v1/posts/media-upload-url (200 OK)
// Retorna Signed URL autorizada temporalmente para Cloud Storage
func (h *PostHandler) MediaUploadURL(c *gin.Context) {
	var req models.MediaUploadURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Metadatos del archivo requeridos",
		})
		return
	}

	// Inspección de formato MIME permitido
	allowedTypes := map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/webp": true,
		"image/gif":  true,
		"video/mp4":  true,
		"video/webm": true,
	}

	if !allowedTypes[strings.ToLower(req.MimeType)] {
		c.JSON(http.StatusUnsupportedMediaType, models.ErrorResponse{
			Error:   "UNSUPPORTED_MEDIA_TYPE",
			Message: "Tipo de archivo no permitido. Formatos aceptados: JPG, PNG, WEBP, GIF, MP4",
		})
		return
	}

	// Límite de 50MB
	if req.FileSize > 50*1024*1024 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "FILE_TOO_LARGE",
			Message: "El archivo excede el tamaño máximo permitido de 50MB",
		})
		return
	}

	fileKey := fmt.Sprintf("uploads/%s-%s", uuid.New().String(), req.Filename)
	signedURL := fmt.Sprintf("https://storage.googleapis.com/forfunable-media/%s?GoogleAccessId=service-account@forfunable.iam.gserviceaccount.com&Expires=%d&Signature=mock_gcp_signed_url_token", fileKey, time.Now().Add(15*time.Minute).Unix())

	c.JSON(http.StatusOK, models.MediaUploadURLResponse{
		UploadURL: signedURL,
		FileKey:   fileKey,
		ExpiresAt: time.Now().Add(15 * time.Minute).Unix(),
	})
}
