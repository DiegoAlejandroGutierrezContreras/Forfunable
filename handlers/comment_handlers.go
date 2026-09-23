package handlers

import (
	"net/http"
	"strconv"

	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

type CommentHandler struct {
	repo repository.Repository
}

func NewCommentHandler(repo repository.Repository) *CommentHandler {
	return &CommentHandler{repo: repo}
}

// ListComments maneja GET /api/v1/posts/:id/comments (200 OK)
// Consulta plana basada en la extensión ltree de PostgreSQL indexada por GiST
func (h *CommentHandler) ListComments(c *gin.Context) {
	postID := c.Param("id")
	sortBy := c.DefaultQuery("sort_by", "path")
	maxDepth, _ := strconv.Atoi(c.DefaultQuery("max_depth", "0"))

	// Validar que el post exista
	if _, err := h.repo.GetPostByID(postID); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Publicación no encontrada",
		})
		return
	}

	comments, err := h.repo.ListCommentsByPost(postID, sortBy, maxDepth)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al recuperar árbol de comentarios",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"post_id":  postID,
		"comments": comments,
		"count":    len(comments),
	})
}

// CreateComment maneja POST /api/v1/comments (201 Created)
func (h *CommentHandler) CreateComment(c *gin.Context) {
	userID := c.GetString("user_id")

	var req models.CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Contenido y post_id requeridos",
		})
		return
	}

	// Sanitización contra XSS
	req.Content = middleware.SanitizeText(req.Content)
	if len(req.Content) == 0 {
		c.JSON(http.StatusUnprocessableEntity, models.ErrorResponse{
			Error:   "UNPROCESSABLE_ENTITY",
			Message: "El contenido del comentario no puede estar vacío",
		})
		return
	}

	comment := &models.Comment{
		PostID:          req.PostID,
		UserID:          userID,
		ParentCommentID: req.ParentCommentID,
		Content:         req.Content,
	}

	if err := h.repo.CreateComment(comment); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, comment)
}

// UpdateComment maneja PATCH /api/v1/comments/:id (200 OK)
// Regla: Restringido al autor original
func (h *CommentHandler) UpdateComment(c *gin.Context) {
	userID := c.GetString("user_id")
	commentID := c.Param("id")

	comment, err := h.repo.GetCommentByID(commentID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Comentario no encontrado",
		})
		return
	}

	if comment.UserID != userID {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "Solo el autor puede editar este comentario",
		})
		return
	}

	var req models.UpdateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Contenido requerido",
		})
		return
	}

	req.Content = middleware.SanitizeText(req.Content)
	updated, err := h.repo.UpdateComment(commentID, req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al actualizar comentario",
		})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// DeleteComment maneja DELETE /api/v1/comments/:id (200 OK)
// Regla: Mantiene intactos los nodos hijos sustituyendo el texto por marca de borrado
func (h *CommentHandler) DeleteComment(c *gin.Context) {
	userID := c.GetString("user_id")
	commentID := c.Param("id")

	comment, err := h.repo.GetCommentByID(commentID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Comentario no encontrado",
		})
		return
	}

	// Puede borrar el autor o un administrador
	role := c.GetString("global_role")
	if comment.UserID != userID && role != models.RoleGlobalAdmin {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "No tienes permiso para eliminar este comentario",
		})
		return
	}

	if err := h.repo.DeleteComment(commentID); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al procesar borrado de comentario",
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Comentario marcado como eliminado (estructura de árbol preservada)",
	})
}
