package handlers

import (
	"net/http"
	"strconv"

	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

type ExtraHandler struct {
	repo repository.Repository
}

func NewExtraHandler(repo repository.Repository) *ExtraHandler {
	return &ExtraHandler{repo: repo}
}

// CreateReport maneja POST /api/v1/reports (201 Created)
func (h *ExtraHandler) CreateReport(c *gin.Context) {
	userID := c.GetString("user_id")

	var req models.CreateReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Parámetros de denuncia inválidos: " + err.Error(),
		})
		return
	}

	req.Description = middleware.SanitizeText(req.Description)

	report := &models.Report{
		ReporterID:  userID,
		TargetID:    req.TargetID,
		TargetType:  req.TargetType,
		ReasonCode:  req.ReasonCode,
		Description: req.Description,
	}

	if err := h.repo.CreateReport(report); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al registrar denuncia",
		})
		return
	}

	c.JSON(http.StatusCreated, report)
}

// CreateCommunityNote maneja POST /api/v1/community-notes (201 Created)
// Regla: Requiere puntuación mínima de karma
func (h *ExtraHandler) CreateCommunityNote(c *gin.Context) {
	userID := c.GetString("user_id")
	user, err := h.repo.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "UNAUTHORIZED",
			Message: "Usuario no autenticado",
		})
		return
	}

	if user.KarmaScore < 50 && user.GlobalRole != models.RoleGlobalAdmin {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "Se requiere un mínimo de 50 puntos de karma para proponer notas comunitarias",
		})
		return
	}

	var req models.CreateCommunityNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Texto de nota y post_id requeridos",
		})
		return
	}

	req.NoteText = middleware.SanitizeText(req.NoteText)

	note := &models.CommunityNote{
		PostID:   req.PostID,
		AuthorID: userID,
		NoteText: req.NoteText,
		ProofURL: req.ProofURL,
	}

	if err := h.repo.CreateCommunityNote(note); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, note)
}

// VoteCommunityNote maneja POST /api/v1/community-notes/:id/vote (200 OK)
func (h *ExtraHandler) VoteCommunityNote(c *gin.Context) {
	userID := c.GetString("user_id")
	noteID := c.Param("id")

	var req models.VoteCommunityNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Parámetro is_helpful requerido",
		})
		return
	}

	if err := h.repo.VoteCommunityNote(noteID, userID, req.IsHelpful); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Voto registrado exitosamente sobre la nota comunitaria",
	})
}

// SearchPredictive maneja GET /api/v1/search/predictive (200 OK)
func (h *ExtraHandler) SearchPredictive(c *gin.Context) {
	q := c.Query("q")
	if len(q) < 2 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "El término de búsqueda debe tener al menos 2 caracteres",
		})
		return
	}

	hits, err := h.repo.SearchPredictive(q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error en búsqueda",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"query": q,
		"hits":  hits,
	})
}

// RecommendationsFeed maneja GET /api/v1/recommendations/feed (200 OK)
// Ejecuta el Algoritmo de Atenuación Temporal (Hot Ranking Decay):
// Score_hot = S_net / (T + 2)^1.8
func (h *ExtraHandler) RecommendationsFeed(c *gin.Context) {
	cursor := c.Query("cursor")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	posts, nextCursor, err := h.repo.GetRecommendedFeed(cursor, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al calcular feed recomendado",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"algorithm":   "Hot Ranking Decay (G=1.8)",
		"items":       posts,
		"next_cursor": nextCursor,
		"count":       len(posts),
	})
}
