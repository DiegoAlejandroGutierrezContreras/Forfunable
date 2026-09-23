package main

import (
	"log"
	"net/http"
	"time"

	"forfunable/config"
	"forfunable/handlers"
	"forfunable/middleware"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.LoadConfig()

	// Inicializar persistencia (Postgres si hay DATABASE_URL, de lo contrario Memoria precargada para Bruno)
	var repo repository.Repository
	if cfg.DatabaseURL != "" {
		log.Println("[INFO] Conectando a base de datos PostgreSQL en Cloud SQL...")
		pgRepo, err := repository.NewPostgresRepository(cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("[FATAL] Error conectando a PostgreSQL: %v", err)
		}
		defer pgRepo.Close()
		repo = pgRepo
		log.Println("[OK] Conexión establecida con PostgreSQL exitosamente.")
	} else {
		log.Println("[INFO] DATABASE_URL no configurada. Iniciando con almacenamiento en Memoria precargado para Bruno y desarrollo local.")
		repo = repository.NewMemoryRepository()
		log.Println("[OK] Repositorio en memoria inicializado con datos semilla.")
	}

	// Instanciar Handlers
	authHandler := handlers.NewAuthHandler(repo, cfg)
	commHandler := handlers.NewCommunityHandler(repo)
	postHandler := handlers.NewPostHandler(repo)
	commentHandler := handlers.NewCommentHandler(repo)
	voteHandler := handlers.NewVoteHandler(repo)
	chatHandler := handlers.NewChatHandler(repo)
	notifHandler := handlers.NewNotificationHandler(repo)
	extraHandler := handlers.NewExtraHandler(repo)
	adminHandler := handlers.NewAdminHandler(repo)

	// Configurar router Gin
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// Middlewares globales de seguridad
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.SecurityHeaders())
	rateLimiter := middleware.NewRateLimiter(300, time.Minute)
	r.Use(rateLimiter.Middleware())

	// Health check perimetral
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":      "HEALTHY",
			"timestamp":   time.Now().Unix(),
			"environment": cfg.Environment,
		})
	})

	// Servir documentación OpenAPI
	r.StaticFile("/openapi.yaml", "./openapi.yaml")

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
			// Rutas estáticas de perfil autenticado primero
			usersAuth := users.Group("")
			usersAuth.Use(middleware.AuthRequired(cfg.JWTSecret))
			{
				usersAuth.GET("/me", authHandler.GetMe)
				usersAuth.PATCH("/me/profile", authHandler.UpdateProfile)
				usersAuth.PATCH("/me/status", authHandler.UpdateStatus)
				usersAuth.POST("/me/verify-age", authHandler.VerifyAge)
				usersAuth.POST("/block", chatHandler.BlockUser)
			}

			// Rutas con parámetro comodín unificado :id
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
			// Módulo 2.1: Moderación y Gestión de Comunidades
			admin.POST("/communities/:id/moderators", adminHandler.AssignModerator)
			admin.PUT("/communities/:id/settings", adminHandler.UpdateCommunitySettings)
			admin.GET("/moderation/reports", adminHandler.ListModerationReports)
			admin.PATCH("/moderation/reports/:id", adminHandler.ResolveReport)
			admin.POST("/moderation/actions/ban", adminHandler.BanUser)
			admin.POST("/moderation/actions/unban", adminHandler.UnbanUser)
			admin.DELETE("/moderation/content/:id/remove", adminHandler.AdminRemoveContent)

			// Módulo 2.2: Operaciones y Auditoría
			admin.GET("/audit/logs", adminHandler.ListAuditLogs)
			admin.GET("/analytics/metrics", adminHandler.GetAnalyticsMetrics)
			admin.POST("/recommendations/reindex", adminHandler.ReindexRecommendations)

			// Exclusivos Global Admin
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

	log.Printf("[INFO] Servidor Forfunable iniciado en el puerto :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("[FATAL] Error en el servidor: %v", err)
	}
}
