package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"forfunable/config"
	"forfunable/handlers"
	"forfunable/middleware"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.LoadConfig()

	// --- Inicializar PostgreSQL (OBLIGATORIO) ---
	// MemoryRepository solo puede usarse en tests unitarios aislados.
	// En Cloud Run: requiere INSTANCE_CONNECTION_NAME + DB_NAME + DB_USER + DB_PASSWORD (socket Unix).
	// En TCP Local: requiere DATABASE_URL.
	dsn, err := cfg.BuildDSN()
	if err != nil {
		log.Fatalf("[FATAL] Configuración de base de datos incompleta: %v\n\nConfigure INSTANCE_CONNECTION_NAME + DB_NAME + DB_USER + DB_PASSWORD (Cloud Run) o DATABASE_URL (modo TCP local).", err)
	}

	pgRepo, err := repository.NewPostgresRepository(dsn)
	if err != nil {
		log.Fatalf("[FATAL] No se pudo conectar a PostgreSQL: %v", err)
	}

	log.Println("[OK] PostgreSQL repository active")

	// --- Configurar Gin ---
	if cfg.GINMode == "release" || cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.SecurityHeaders())
	rateLimiter := middleware.NewRateLimiter(300, time.Minute)
	r.Use(rateLimiter.Middleware())

	// --- Health Check (FASE 3) ---
	// Verifica API + PostgreSQL. Devuelve 503 si la BD no responde.
	r.GET("/health", func(c *gin.Context) {
		dbStatus := "CONNECTED"
		httpStatus := http.StatusOK

		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		if err := pgRepo.Ping(ctx); err != nil {
			dbStatus = "DISCONNECTED"
			httpStatus = http.StatusServiceUnavailable
		}

		c.JSON(httpStatus, gin.H{
			"status": func() string {
				if dbStatus == "CONNECTED" {
					return "HEALTHY"
				}
				return "DEGRADED"
			}(),
			"environment": cfg.Environment,
			"database":    dbStatus,
		})
	})

	// Servir documentación OpenAPI
	r.StaticFile("/openapi.yaml", "./openapi.yaml")

	// --- Instanciar Handlers ---
	authHandler := handlers.NewAuthHandler(pgRepo, cfg)
	commHandler := handlers.NewCommunityHandler(pgRepo)
	postHandler := handlers.NewPostHandler(pgRepo)
	commentHandler := handlers.NewCommentHandler(pgRepo)
	voteHandler := handlers.NewVoteHandler(pgRepo)
	chatHandler := handlers.NewChatHandler(pgRepo)
	notifHandler := handlers.NewNotificationHandler(pgRepo)
	extraHandler := handlers.NewExtraHandler(pgRepo)
	adminHandler := handlers.NewAdminHandler(pgRepo)

	// ==========================================
	// 1. ENDPOINTS DE CLIENTE FINAL (/api/v1/)
	// ==========================================
	v1 := r.Group("/api/v1")
	{
		// Módulo 1.1: Autenticación, Sesión y Perfiles
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

		// Módulo 1.2: Comunidades y Membresías
		communities := v1.Group("/communities")
		{
			communities.GET("", commHandler.ListCommunities)
			communities.GET("/:name", middleware.OptionalAuth(cfg.JWTSecret), commHandler.GetCommunityDetail)

			commAuth := communities.Group("")
			commAuth.Use(middleware.AuthRequired(cfg.JWTSecret))
			{
				commAuth.POST("", commHandler.CreateCommunity)
				commAuth.POST("/:id/join", commHandler.JoinCommunity)
				commAuth.DELETE("/:id/leave", commHandler.LeaveCommunity)
			}
		}

		// Módulo 1.3: Publicaciones y Archivos Multimedia
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

		// Módulo 1.4: Comentarios Jerárquicos en Árbol
		comments := v1.Group("/comments")
		comments.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			comments.POST("", commentHandler.CreateComment)
			comments.PATCH("/:id", commentHandler.UpdateComment)
			comments.DELETE("/:id", commentHandler.DeleteComment)
		}

		// Módulo 1.5: Votación e Interacción Social
		votes := v1.Group("/votes")
		votes.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			votes.POST("/posts/:id", voteHandler.VotePost)
			votes.POST("/comments/:id", voteHandler.VoteComment)
		}

		// Módulo 1.6: Mensajería Privada, Solicitudes y Amistades
		chats := v1.Group("/chats")
		chats.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			chats.POST("/requests", chatHandler.CreateChatRequest)
			chats.PATCH("/requests/:id", chatHandler.UpdateChatRequest)
			chats.GET("/conversations", chatHandler.ListConversations)
			chats.GET("/conversations/:id/messages", chatHandler.ListMessages)
			chats.POST("/conversations/:id/messages", chatHandler.SendMessage)
		}

		// Módulo 1.7: Sistema de Notificaciones
		notifications := v1.Group("/notifications")
		notifications.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			notifications.GET("", notifHandler.ListNotifications)
			notifications.PATCH("/:id/read", notifHandler.MarkAsRead)
			notifications.GET("/settings", notifHandler.GetSettings)
			notifications.PUT("/settings", notifHandler.UpdateSettings)
		}

		// Módulo 1.8: Participación Comunitaria, Búsqueda y Recomendaciones
		reports := v1.Group("/reports")
		reports.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			reports.POST("", extraHandler.CreateReport)
		}

		commNotes := v1.Group("/community-notes")
		commNotes.Use(middleware.AuthRequired(cfg.JWTSecret))
		{
			commNotes.POST("", extraHandler.CreateCommunityNote)
			commNotes.POST("/:id/vote", extraHandler.VoteCommunityNote)
		}

		v1.GET("/search/predictive", extraHandler.SearchPredictive)
		v1.GET("/recommendations/feed", middleware.AuthRequired(cfg.JWTSecret), extraHandler.RecommendationsFeed)

		// ==========================================
		// 2. CONSOLA DE ADMINISTRACIÓN (/api/v1/admin/)
		// ==========================================
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

	// --- Servidor HTTP con timeouts ---
	srv := &http.Server{
		Addr:         "0.0.0.0:" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// --- Iniciar servidor en goroutine ---
	go func() {
		log.Printf("[INFO] Servidor Forfunable escuchando en 0.0.0.0:%s (env: %s)", cfg.Port, cfg.Environment)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] Error al iniciar el servidor HTTP: %v", err)
		}
	}()

	// --- Graceful Shutdown (SIGTERM / SIGINT) ---
	// Cloud Run envía SIGTERM cuando va a detener el contenedor.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	log.Println("[INFO] Señal de apagado recibida. Cerrando servidor...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[WARN] Error durante el apagado ordenado del servidor HTTP: %v", err)
	}

	if err := pgRepo.Close(); err != nil {
		log.Printf("[WARN] Error al cerrar el pool de PostgreSQL: %v", err)
	}

	log.Println("[INFO] Servidor apagado correctamente.")
}
