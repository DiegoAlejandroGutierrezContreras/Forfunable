package handlers

import (
	"net/http"

	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

type VoteHandler struct {
	repo repository.Repository
}

func NewVoteHandler(repo repository.Repository) *VoteHandler {
	return &VoteHandler{repo: repo}
}

// VotePost maneja POST /api/v1/votes/posts/:id (200 OK)
// Aplica el patrón write-behind en memoria y persistencia
func (h *VoteHandler) VotePost(c *gin.Context) {
	userID := c.GetString("user_id")
	postID := c.Param("id")

	var req models.VoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Payload inválido. El valor del voto debe ser 1, -1 o 0",
		})
		return
	}

	if req.VoteValue < -1 || req.VoteValue > 1 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "El valor del voto debe ser 1 (upvote), -1 (downvote) o 0 (cancelar)",
		})
		return
	}

	resp, err := h.repo.VotePost(userID, postID, req.VoteValue)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// VoteComment maneja POST /api/v1/votes/comments/:id (200 OK)
func (h *VoteHandler) VoteComment(c *gin.Context) {
	userID := c.GetString("user_id")
	commentID := c.Param("id")

	var req models.VoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Payload inválido. El valor del voto debe ser 1, -1 o 0",
		})
		return
	}

	if req.VoteValue < -1 || req.VoteValue > 1 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "El valor del voto debe ser 1, -1 o 0",
		})
		return
	}

	resp, err := h.repo.VoteComment(userID, commentID, req.VoteValue)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// GetUserKarma maneja GET /api/v1/users/:id/karma (200 OK)
func (h *VoteHandler) GetUserKarma(c *gin.Context) {
	targetUserID := c.Param("id")
	detail, err := h.repo.GetUserKarmaDetail(targetUserID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Usuario no encontrado",
		})
		return
	}

	c.JSON(http.StatusOK, detail)
}
