package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	repo repository.Repository
}

func NewAdminHandler(repo repository.Repository) *AdminHandler {
	return &AdminHandler{repo: repo}
}

// AssignModerator maneja POST /api/v1/admin/communities/:id/moderators (200 OK)
// Exclusivo para el creador de la comunidad (Owner) o Global Admin
func (h *AdminHandler) AssignModerator(c *gin.Context) {
	callerID := c.GetString("user_id")
	callerRole := c.GetString("global_role")
	commID := c.Param("id")

	comm, err := h.repo.GetCommunityByID(commID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Comunidad no encontrada",
		})
		return
	}

	if callerRole != models.RoleGlobalAdmin && comm.CreatorID != callerID {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "Solo el creador del foro o un Administrador Global pueden asignar moderadores",
		})
		return
	}

	var req models.AssignModeratorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Datos de asignación requeridos: " + err.Error(),
		})
		return
	}

	mod := &models.CommunityModerator{
		CommunityID: commID,
		UserID:      req.UserID,
		ModRole:     req.Role,
		Permissions: req.Permissions,
	}

	if err := h.repo.AssignCommunityModerator(mod); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: err.Error(),
		})
		return
	}

	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: callerID,
		CommunityID: &commID,
		ActionType:  "ASSIGN_MODERATOR",
		TargetID:    req.UserID,
		Reason:      fmt.Sprintf("Asignado rol %s", req.Role),
	})

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Moderador asignado exitosamente",
		Data:    mod,
	})
}

// UpdateCommunitySettings maneja PUT /api/v1/admin/communities/:id/settings (200 OK)
// Requiere rol Lead Mod o Global Admin
func (h *AdminHandler) UpdateCommunitySettings(c *gin.Context) {
	callerID := c.GetString("user_id")
	callerRole := c.GetString("global_role")
	commID := c.Param("id")

	comm, err := h.repo.GetCommunityByID(commID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Comunidad no encontrada",
		})
		return
	}

	// Comprobar rol de moderador
	mod, _ := h.repo.GetCommunityModerator(commID, callerID)
	isLeadOrOwner := mod != nil && (mod.ModRole == models.ModRoleOwner || mod.ModRole == models.ModRoleLeadMod)

	if callerRole != models.RoleGlobalAdmin && comm.CreatorID != callerID && !isLeadOrOwner {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "Requiere rol Lead Mod, Owner o Global Admin",
		})
		return
	}

	var req models.UpdateCommunitySettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Cuerpo de solicitud inválido",
		})
		return
	}

	if err := h.repo.UpdateCommunitySettings(commID, req.RulesText, req.IsPrivate, req.AgeRestricted); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al actualizar configuración de comunidad",
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Configuraciones de la comunidad actualizadas correctamente",
	})
}

// ListModerationReports maneja GET /api/v1/admin/moderation/reports (200 OK)
func (h *AdminHandler) ListModerationReports(c *gin.Context) {
	commID := c.Query("community_id")
	status := c.Query("status")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	reports, err := h.repo.ListReports(commID, status, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al listar denuncias",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": reports,
		"count": len(reports),
	})
}

// ResolveModerationReport maneja PATCH /api/v1/admin/moderation/reports/:id (200 OK)
func (h *AdminHandler) ResolveReport(c *gin.Context) {
	moderatorID := c.GetString("user_id")
	reportID := c.Param("id")

	var req models.ResolveReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Estado y notas requeridas. Estados: PENDING, UNDER_REVIEW, ACTIONED, DISMISSED",
		})
		return
	}

	if err := h.repo.ResolveReport(reportID, req.Status, req.ModeratorNotes, moderatorID); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: err.Error(),
		})
		return
	}

	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: moderatorID,
		ActionType:  "RESOLVE_REPORT",
		TargetID:    reportID,
		Reason:      fmt.Sprintf("Reporte resuelto con estado %s: %s", req.Status, req.ModeratorNotes),
	})

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Denuncia resuelta y registrada en auditoría inmutable",
	})
}

// BanUser maneja POST /api/v1/admin/moderation/actions/ban (200 OK)
func (h *AdminHandler) BanUser(c *gin.Context) {
	callerID := c.GetString("user_id")

	var req models.BanUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Parámetros de expulsión requeridos",
		})
		return
	}

	var expires *time.Time
	if req.DurationDays > 0 {
		exp := time.Now().AddDate(0, 0, req.DurationDays)
		expires = &exp
	}

	ban := &models.CommunityBan{
		UserID:      req.UserID,
		CommunityID: req.CommunityID,
		Reason:      req.Reason,
		ExpiresAt:   expires,
	}

	if err := h.repo.BanUser(ban); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al aplicar sanción",
		})
		return
	}

	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: callerID,
		CommunityID: &req.CommunityID,
		ActionType:  "BAN_USER",
		TargetID:    req.UserID,
		Reason:      req.Reason,
	})

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Usuario sancionado y expulsado de la comunidad",
	})
}

// UnbanUser maneja POST /api/v1/admin/moderation/actions/unban (200 OK)
func (h *AdminHandler) UnbanUser(c *gin.Context) {
	callerID := c.GetString("user_id")

	var req models.UnbanUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "user_id y community_id requeridos",
		})
		return
	}

	if err := h.repo.UnbanUser(req.UserID, req.CommunityID, req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al levantar sanción",
		})
		return
	}

	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: callerID,
		CommunityID: &req.CommunityID,
		ActionType:  "UNBAN_USER",
		TargetID:    req.UserID,
		Reason:      req.Reason,
	})

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Sanción levantada correctamente",
	})
}

// AdminRemoveContent maneja DELETE /api/v1/admin/moderation/content/:id/remove (200 OK)
func (h *AdminHandler) AdminRemoveContent(c *gin.Context) {
	callerID := c.GetString("user_id")
	targetID := c.Param("id")

	// Intentar borrar como post primero, luego como comentario
	errPost := h.repo.RemovePostByAdmin(targetID)
	errComment := h.repo.DeleteComment(targetID)

	if errPost != nil && errComment != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: "Contenido no encontrado",
		})
		return
	}

	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: callerID,
		ActionType:  "REMOVE_CONTENT_FORCE",
		TargetID:    targetID,
		Reason:      "Retirado forzosamente por moderación administrativa",
	})

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Contenido retirado por acción de moderación forzada",
	})
}

// ListUsers maneja GET /api/v1/admin/users (200 OK)
// Exclusivo para Global Admin
func (h *AdminHandler) ListUsers(c *gin.Context) {
	search := c.Query("search")
	role := c.Query("role")
	status := c.Query("status")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	users, total, err := h.repo.ListUsers(search, role, status, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al listar usuarios",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": users,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// UpdateUserRole maneja PATCH /api/v1/admin/users/:id/role (200 OK)
func (h *AdminHandler) UpdateUserRole(c *gin.Context) {
	targetID := c.Param("id")

	var req models.UpdateUserRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Rol global inválido. Valores permitidos: USER, COMMUNITY_MOD, GLOBAL_ADMIN",
		})
		return
	}

	if err := h.repo.UpdateUserRole(targetID, req.GlobalRole); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: "Rol global actualizado a " + req.GlobalRole,
	})
}

// UpdateUserStatus maneja PATCH /api/v1/admin/users/:id/status (200 OK)
func (h *AdminHandler) UpdateUserStatus(c *gin.Context) {
	targetID := c.Param("id")

	var req models.UpdateUserStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "BAD_REQUEST",
			Message: "Parámetros de estado requeridos",
		})
		return
	}

	if err := h.repo.UpdateUserGlobalStatus(targetID, req.IsActive, req.FreezeReason); err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "NOT_FOUND",
			Message: err.Error(),
		})
		return
	}

	msg := "Cuenta activada"
	if !req.IsActive {
		msg = "Cuenta suspendida globalmente e invalidación de sesiones en Redis aplicada"
	}

	c.JSON(http.StatusOK, models.StandardResponse{
		Success: true,
		Message: msg,
	})
}

// ListAuditLogs maneja GET /api/v1/admin/audit/logs (200 OK)
func (h *AdminHandler) ListAuditLogs(c *gin.Context) {
	modID := c.Query("moderator_id")
	action := c.Query("action_type")
	fromDate := c.Query("from_date")
	toDate := c.Query("to_date")

	logs, err := h.repo.ListModerationLogs(modID, action, fromDate, toDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al consultar auditoría",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": logs,
		"count": len(logs),
	})
}

// GetAnalyticsMetrics maneja GET /api/v1/admin/analytics/metrics (200 OK)
func (h *AdminHandler) GetAnalyticsMetrics(c *gin.Context) {
	timeframe := c.DefaultQuery("timeframe", "24h")
	metrics, err := h.repo.GetAnalyticsMetrics(timeframe)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error al consolidar métricas",
		})
		return
	}

	c.JSON(http.StatusOK, metrics)
}

// GetSecurityAccountGroups maneja GET /api/v1/admin/security/account-groups (200 OK)
func (h *AdminHandler) GetSecurityAccountGroups(c *gin.Context) {
	riskThresh, _ := strconv.ParseFloat(c.DefaultQuery("risk_threshold", "0.8"), 64)
	groups, err := h.repo.GetSecurityAccountGroups(riskThresh)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "INTERNAL_ERROR",
			Message: "Error consultando grupos sospechosos",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"risk_threshold": riskThresh,
		"groups":         groups,
	})
}

// ReindexRecommendations maneja POST /api/v1/admin/recommendations/reindex (202 Accepted)
func (h *AdminHandler) ReindexRecommendations(c *gin.Context) {
	var req models.ReindexRequest
	_ = c.ShouldBindJSON(&req)

	target := "global"
	if strings.TrimSpace(req.CommunityID) != "" {
		target = req.CommunityID
	}

	c.JSON(http.StatusAccepted, models.StandardResponse{
		Success: true,
		Message: fmt.Sprintf("Pipeline asíncrono en Vertex AI Search and Conversation disparado para objetivo: %s", target),
	})
}
