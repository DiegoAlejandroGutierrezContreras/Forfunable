package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"forfunable/config"
	"forfunable/handlers"
	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

func setupFullTestServer() (*gin.Engine, repository.Repository, *config.Config, string, string, string) {
	gin.SetMode(gin.TestMode)
	cfg := config.LoadConfig()
	repo := repository.NewMemoryRepository()

	r := gin.New()
	r.Use(gin.Recovery())

	authHandler := handlers.NewAuthHandler(repo, cfg)
	commHandler := handlers.NewCommunityHandler(repo)
	postHandler := handlers.NewPostHandler(repo)
	commentHandler := handlers.NewCommentHandler(repo)
	voteHandler := handlers.NewVoteHandler(repo)
	chatHandler := handlers.NewChatHandler(repo)
	notifHandler := handlers.NewNotificationHandler(repo)
	extraHandler := handlers.NewExtraHandler(repo)
	adminHandler := handlers.NewAdminHandler(repo)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "HEALTHY"})
	})

	v1 := r.Group("/api/v1")
	{
		auth := v1.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
			auth.POST("/logout", authHandler.Logout)
		}

		users := v1.Group("/users")
		{
			usersAuth := users.Group("")
			usersAuth.Use(middleware.AuthRequired(cfg.JWTSecret))
			{
				usersAuth.GET("/me", authHandler.GetMe)
				usersAuth.PATCH("/me/profile", authHandler.UpdateProfile)
				usersAuth.PATCH("/me/status", authHandler.UpdateStatus)
				usersAuth.POST("/me/verify-age", authHandler.VerifyAge)
				usersAuth.POST("/block", chatHandler.BlockUser)
			}
			users.GET("/:id/karma", voteHandler.GetUserKarma)
			users.GET("/:id", authHandler.GetPublicProfile)
		}

		comm := v1.Group("/communities")
		{
			comm.GET("", commHandler.ListCommunities)
			comm.GET("/:name", commHandler.GetCommunityDetail)
			commAuth := comm.Group("")
			commAuth.Use(middleware.AuthRequired(cfg.JWTSecret))
			{
				commAuth.POST("", commHandler.CreateCommunity)
				commAuth.POST("/:id/join", commHandler.JoinCommunity)
				commAuth.DELETE("/:id/leave", commHandler.LeaveCommunity)
			}
		}

		posts := v1.Group("/posts")
		{
			posts.GET("", postHandler.ListPosts)
			posts.GET("/:id", postHandler.GetPostDetail)
			posts.GET("/:id/comments", commentHandler.ListComments)
			postsAuth := posts.Group("")
			postsAuth.Use(middleware.AuthRequired(cfg.JWTSecret))
			{
				postsAuth.POST("", postHandler.CreatePost)
				postsAuth.PATCH("/:id", postHandler.UpdatePost)
				postsAuth.DELETE("/:id", postHandler.DeletePost)
				postsAuth.POST("/media-upload-url", postHandler.MediaUploadURL)
			}
		}

		comments := v1.Group("/comments")
		comments.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			comments.POST("", commentHandler.CreateComment)
			comments.PATCH("/:id", commentHandler.UpdateComment)
			comments.DELETE("/:id", commentHandler.DeleteComment)
		}

		votes := v1.Group("/votes")
		votes.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			votes.POST("/posts/:id", voteHandler.VotePost)
			votes.POST("/comments/:id", voteHandler.VoteComment)
		}

		chats := v1.Group("/chats")
		chats.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			chats.POST("/requests", chatHandler.CreateChatRequest)
			chats.PATCH("/requests/:id", chatHandler.UpdateChatRequest)
			chats.GET("/conversations", chatHandler.ListConversations)
			chats.GET("/conversations/:id/messages", chatHandler.ListMessages)
			chats.POST("/conversations/:id/messages", chatHandler.SendMessage)
		}

		notifs := v1.Group("/notifications")
		notifs.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			notifs.GET("", notifHandler.ListNotifications)
			notifs.PATCH("/:id/read", notifHandler.MarkAsRead)
			notifs.GET("/settings", notifHandler.GetSettings)
			notifs.PUT("/settings", notifHandler.UpdateSettings)
		}

		reports := v1.Group("/reports")
		reports.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			reports.POST("", extraHandler.CreateReport)
		}

		cNotes := v1.Group("/community-notes")
		cNotes.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			cNotes.POST("", extraHandler.CreateCommunityNote)
			cNotes.POST("/:id/vote", extraHandler.VoteCommunityNote)
		}

		v1.GET("/search/predictive", extraHandler.SearchPredictive)
		v1.GET("/recommendations/feed", middleware.AuthRequired(cfg.JWTSecret), extraHandler.RecommendationsFeed)

		admin := v1.Group("/admin")
		admin.Use(middleware.AuthRequired(cfg.JWTSecret))
		admin.Use(middleware.RequireRole("COMMUNITY_MOD", "GLOBAL_ADMIN"))
		{
			admin.POST("/communities/:id/moderators", adminHandler.AssignModerator)
			admin.PUT("/communities/:id/settings", adminHandler.UpdateCommunitySettings)
			admin.GET("/moderation/reports", adminHandler.ListModerationReports)
			admin.PATCH("/moderation/reports/:id", adminHandler.ResolveReport)
			admin.POST("/moderation/actions/ban", adminHandler.BanUser)
			admin.POST("/moderation/actions/unban", adminHandler.UnbanUser)
			admin.DELETE("/moderation/content/:id/remove", adminHandler.AdminRemoveContent)
			admin.GET("/audit/logs", adminHandler.ListAuditLogs)
			admin.GET("/analytics/metrics", adminHandler.GetAnalyticsMetrics)
			admin.POST("/recommendations/reindex", adminHandler.ReindexRecommendations)

			adminOnly := admin.Group("")
			adminOnly.Use(middleware.RequireRole("GLOBAL_ADMIN"))
			{
				adminOnly.GET("/users", adminHandler.ListUsers)
				adminOnly.PATCH("/users/:id/role", adminHandler.UpdateUserRole)
				adminOnly.PATCH("/users/:id/status", adminHandler.UpdateUserStatus)
				adminOnly.GET("/security/account-groups", adminHandler.GetSecurityAccountGroups)
			}
		}
	}

	userToken, _, _ := middleware.GenerateTokens("a0000000-0000-0000-0000-000000000003", "kiba_dev", models.RoleUser, time.Hour, 24*time.Hour, cfg.JWTSecret)
	adminToken, _, _ := middleware.GenerateTokens("a0000000-0000-0000-0000-000000000001", "admin_master", models.RoleGlobalAdmin, time.Hour, 24*time.Hour, cfg.JWTSecret)
	modToken, _, _ := middleware.GenerateTokens("a0000000-0000-0000-0000-000000000002", "mod_diego", models.RoleCommunityMod, time.Hour, 24*time.Hour, cfg.JWTSecret)

	return r, repo, cfg, userToken, adminToken, modToken
}

// TestHealthAndPublicEndpoints prueba health check y endpoints públicos
func TestHealthAndPublicEndpoints(t *testing.T) {
	router, _, _, _, _, _ := setupFullTestServer()

	// 1. Health check
	reqH, _ := http.NewRequest("GET", "/health", nil)
	wH := httptest.NewRecorder()
	router.ServeHTTP(wH, reqH)
	if wH.Code != http.StatusOK {
		t.Errorf("Esperado 200 en /health, recibido: %d", wH.Code)
	}

	// 2. Public user profile
	reqUser, _ := http.NewRequest("GET", "/api/v1/users/kiba_dev", nil)
	wUser := httptest.NewRecorder()
	router.ServeHTTP(wUser, reqUser)
	if wUser.Code != http.StatusOK {
		t.Errorf("Esperado 200 en GET /api/v1/users/kiba_dev, recibido: %d", wUser.Code)
	}

	// 3. Predictive search
	reqSearch, _ := http.NewRequest("GET", "/api/v1/search/predictive?q=golang", nil)
	wSearch := httptest.NewRecorder()
	router.ServeHTTP(wSearch, reqSearch)
	if wSearch.Code != http.StatusOK {
		t.Errorf("Esperado 200 en /api/v1/search/predictive, recibido: %d", wSearch.Code)
	}
}

// TestChatAndMessagingFlow prueba el flujo completo de chats, solicitudes y bloqueo
func TestChatAndMessagingFlow(t *testing.T) {
	router, _, _, userToken, _, modToken := setupFullTestServer()

	// 1. Enviar solicitud de chat de user a mod
	chatReq := models.CreateChatRequest{
		RecipientUserID: "a0000000-0000-0000-0000-000000000002",
		InitialMessage:  "Hola mod, consulta técnica sobre Go",
	}
	bChat, _ := json.Marshal(chatReq)
	req1, _ := http.NewRequest("POST", "/api/v1/chats/requests", bytes.NewBuffer(bChat))
	req1.Header.Set("Authorization", "Bearer "+userToken)
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 en solicitud de chat, recibido: %d", w1.Code)
	}

	var createdReq models.ChatRequest
	_ = json.Unmarshal(w1.Body.Bytes(), &createdReq)

	// 2. Mod acepta la solicitud
	actionReq := models.UpdateChatActionRequest{Action: "ACCEPT"}
	bAct, _ := json.Marshal(actionReq)
	req2, _ := http.NewRequest("PATCH", "/api/v1/chats/requests/"+createdReq.ID, bytes.NewBuffer(bAct))
	req2.Header.Set("Authorization", "Bearer "+modToken)
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	t.Logf("w2.Code: %d, body: %s", w2.Code, w2.Body.String())
	if w2.Code != http.StatusOK {
		t.Fatalf("Esperado 200 al aceptar solicitud, recibido: %d", w2.Code)
	}

	// 3. Listar conversaciones
	req3, _ := http.NewRequest("GET", "/api/v1/chats/conversations", nil)
	req3.Header.Set("Authorization", "Bearer "+userToken)
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Fatalf("Esperado 200 en conversaciones, recibido: %d", w3.Code)
	}

	var convList struct {
		Items []*models.ChatConversation `json:"items"`
	}
	_ = json.Unmarshal(w3.Body.Bytes(), &convList)
	if len(convList.Items) == 0 {
		t.Fatalf("Se esperaba al menos una conversación creada automáticamente")
	}

	convID := convList.Items[0].ID

	// 4. Enviar mensaje de chat
	msgReq := models.SendChatMessageRequest{
		MessageText: "Mensaje de prueba en conversación activa",
	}
	bMsg, _ := json.Marshal(msgReq)
	req4, _ := http.NewRequest("POST", "/api/v1/chats/conversations/"+convID+"/messages", bytes.NewBuffer(bMsg))
	req4.Header.Set("Authorization", "Bearer "+userToken)
	req4.Header.Set("Content-Type", "application/json")
	w4 := httptest.NewRecorder()
	router.ServeHTTP(w4, req4)
	if w4.Code != http.StatusCreated {
		t.Errorf("Esperado 201 al enviar mensaje, recibido: %d", w4.Code)
	}

	// 5. Bloquear usuario
	blockReq := models.BlockUserRequest{TargetUserID: "a0000000-0000-0000-0000-000000000004"}
	bBlock, _ := json.Marshal(blockReq)
	req5, _ := http.NewRequest("POST", "/api/v1/users/block", bytes.NewBuffer(bBlock))
	req5.Header.Set("Authorization", "Bearer "+userToken)
	req5.Header.Set("Content-Type", "application/json")
	w5 := httptest.NewRecorder()
	router.ServeHTTP(w5, req5)
	if w5.Code != http.StatusOK {
		t.Errorf("Esperado 200 al bloquear usuario, recibido: %d", w5.Code)
	}
}

// TestNotificationsAndReports prueba notificaciones y denuncias
func TestNotificationsAndReports(t *testing.T) {
	router, _, _, userToken, adminToken, _ := setupFullTestServer()

	// 1. Obtener ajustes de notificación
	req1, _ := http.NewRequest("GET", "/api/v1/notifications/settings", nil)
	req1.Header.Set("Authorization", "Bearer "+userToken)
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Errorf("Esperado 200 en GET settings, recibido: %d", w1.Code)
	}

	// 2. Actualizar ajustes de notificación
	setReq := models.UpdateNotificationSettingsRequest{
		EmailOnReply:          false,
		EmailOnMention:        true,
		PushOnChatRequest:     true,
		PushOnCommunityUpdate: true,
	}
	bSet, _ := json.Marshal(setReq)
	req2, _ := http.NewRequest("PUT", "/api/v1/notifications/settings", bytes.NewBuffer(bSet))
	req2.Header.Set("Authorization", "Bearer "+userToken)
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Errorf("Esperado 200 en PUT settings, recibido: %d", w2.Code)
	}

	// 3. Crear denuncia (report)
	repReq := models.CreateReportRequest{
		TargetID:    "c0000000-0000-0000-0000-000000000001",
		TargetType:  "POST",
		ReasonCode:  "SPAM",
		Description: "Prueba de denuncia automática",
	}
	bRep, _ := json.Marshal(repReq)
	req3, _ := http.NewRequest("POST", "/api/v1/reports", bytes.NewBuffer(bRep))
	req3.Header.Set("Authorization", "Bearer "+userToken)
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	if w3.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 al crear denuncia, recibido: %d", w3.Code)
	}

	var createdRep models.Report
	_ = json.Unmarshal(w3.Body.Bytes(), &createdRep)

	// 4. Admin lista denuncias
	req4, _ := http.NewRequest("GET", "/api/v1/admin/moderation/reports", nil)
	req4.Header.Set("Authorization", "Bearer "+adminToken)
	w4 := httptest.NewRecorder()
	router.ServeHTTP(w4, req4)
	if w4.Code != http.StatusOK {
		t.Errorf("Esperado 200 en listado de denuncias de admin, recibido: %d", w4.Code)
	}

	// 5. Admin resuelve denuncia
	resolveReq := models.ResolveReportRequest{
		Status:         "ACTIONED",
		ModeratorNotes: "Contenido revisado y verificado",
	}
	bRes, _ := json.Marshal(resolveReq)
	req5, _ := http.NewRequest("PATCH", "/api/v1/admin/moderation/reports/"+createdRep.ID, bytes.NewBuffer(bRes))
	req5.Header.Set("Authorization", "Bearer "+adminToken)
	req5.Header.Set("Content-Type", "application/json")
	w5 := httptest.NewRecorder()
	router.ServeHTTP(w5, req5)
	if w5.Code != http.StatusOK {
		t.Errorf("Esperado 200 al resolver denuncia, recibido: %d", w5.Code)
	}
}

// TestAdminOperations prueba métricas, auditoría, roles y re-indexación
func TestAdminOperations(t *testing.T) {
	router, _, _, userToken, adminToken, _ := setupFullTestServer()

	// 1. Obtener métricas consolidadas
	req1, _ := http.NewRequest("GET", "/api/v1/admin/analytics/metrics", nil)
	req1.Header.Set("Authorization", "Bearer "+adminToken)
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Errorf("Esperado 200 en métricas, recibido: %d", w1.Code)
	}

	// 2. Consultar logs de auditoría
	req2, _ := http.NewRequest("GET", "/api/v1/admin/audit/logs", nil)
	req2.Header.Set("Authorization", "Bearer "+adminToken)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Errorf("Esperado 200 en logs de auditoría, recibido: %d", w2.Code)
	}

	// 3. Modificar rol global de usuario (Global Admin only)
	roleReq := models.UpdateUserRoleRequest{GlobalRole: "COMMUNITY_MOD"}
	bRole, _ := json.Marshal(roleReq)
	req3, _ := http.NewRequest("PATCH", "/api/v1/admin/users/a0000000-0000-0000-0000-000000000004/role", bytes.NewBuffer(bRole))
	req3.Header.Set("Authorization", "Bearer "+adminToken)
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Errorf("Esperado 200 al actualizar rol de usuario, recibido: %d", w3.Code)
	}

	// 4. Re-indexación en Vertex AI (202 Accepted)
	reindexReq := models.ReindexRequest{CommunityID: "b0000000-0000-0000-0000-000000000001"}
	bReindex, _ := json.Marshal(reindexReq)
	req4, _ := http.NewRequest("POST", "/api/v1/admin/recommendations/reindex", bytes.NewBuffer(bReindex))
	req4.Header.Set("Authorization", "Bearer "+adminToken)
	req4.Header.Set("Content-Type", "application/json")
	w4 := httptest.NewRecorder()
	router.ServeHTTP(w4, req4)
	if w4.Code != http.StatusAccepted {
		t.Errorf("Esperado 202 Accepted en reindexación de recomendaciones, recibido: %d", w4.Code)
	}

	// 5. Feed de recomendaciones para usuario
	req5, _ := http.NewRequest("GET", "/api/v1/recommendations/feed?limit=5", nil)
	req5.Header.Set("Authorization", "Bearer "+userToken)
	w5 := httptest.NewRecorder()
	router.ServeHTTP(w5, req5)
	if w5.Code != http.StatusOK {
		t.Errorf("Esperado 200 en feed de recomendaciones, recibido: %d", w5.Code)
	}
}
