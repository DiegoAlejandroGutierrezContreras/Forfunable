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

func setupTestServer() (*gin.Engine, repository.Repository, *config.Config, string, string) {
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
	adminHandler := handlers.NewAdminHandler(repo)

	v1 := r.Group("/api/v1")
	{
		auth := v1.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
		}

		comm := v1.Group("/communities")
		{
			comm.GET("", commHandler.ListCommunities)
			comm.GET("/:name", commHandler.GetCommunityDetail)
			comm.POST("", middleware.AuthRequired(cfg.JWTSecret), commHandler.CreateCommunity)
			comm.POST("/:id/join", middleware.AuthRequired(cfg.JWTSecret), commHandler.JoinCommunity)
			comm.DELETE("/:id/leave", middleware.AuthRequired(cfg.JWTSecret), commHandler.LeaveCommunity)
		}

		posts := v1.Group("/posts")
		{
			posts.GET("", postHandler.ListPosts)
			posts.GET("/:id", postHandler.GetPostDetail)
			posts.GET("/:id/comments", commentHandler.ListComments)
			posts.POST("", middleware.AuthRequired(cfg.JWTSecret), postHandler.CreatePost)
			posts.PATCH("/:id", middleware.AuthRequired(cfg.JWTSecret), postHandler.UpdatePost)
			posts.DELETE("/:id", middleware.AuthRequired(cfg.JWTSecret), postHandler.DeletePost)
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
		}

		admin := v1.Group("/admin")
		admin.Use(middleware.AuthRequired(cfg.JWTSecret))
		admin.Use(middleware.RequireRole("COMMUNITY_MOD", "GLOBAL_ADMIN"))
		{
			admin.DELETE("/moderation/content/:id/remove", adminHandler.AdminRemoveContent)
		}
	}

	// Token de usuario regular con karma (kiba_dev, karma 250)
	userToken, _, _ := middleware.GenerateTokens("a0000000-0000-0000-0000-000000000003", "kiba_dev", models.RoleUser, time.Hour, 24*time.Hour, cfg.JWTSecret)

	// Token de admin (admin_master)
	adminToken, _, _ := middleware.GenerateTokens("a0000000-0000-0000-0000-000000000001", "admin_master", models.RoleGlobalAdmin, time.Hour, 24*time.Hour, cfg.JWTSecret)

	return r, repo, cfg, userToken, adminToken
}

// TestPostCRUD prueba exhaustiva de ciclo CREATE, READ, UPDATE, DELETE para Publicaciones
// Validando: casos exitosos, inválidos, sin permisos y de datos inexistentes
func TestPostCRUD(t *testing.T) {
	router, _, _, userToken, _ := setupTestServer()

	// 1. CREATE - Exitoso (201)
	createBody := models.CreatePostRequest{
		CommunityID: "b0000000-0000-0000-0000-000000000001",
		Title:       "Publicación de Prueba Go",
		ContentType: "TEXT",
		BodyText:    "Contenido completo para pruebas unitarias",
	}
	bodyBytes, _ := json.Marshal(createBody)
	req, _ := http.NewRequest("POST", "/api/v1/posts", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+userToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 Created al crear post, recibido: %d, body: %s", w.Code, w.Body.String())
	}

	var createdPost models.Post
	_ = json.Unmarshal(w.Body.Bytes(), &createdPost)
	postID := createdPost.ID

	// 2. CREATE - Inválido (400 - sin campos requeridos)
	reqBad, _ := http.NewRequest("POST", "/api/v1/posts", bytes.NewBuffer([]byte(`{"title": ""}`)))
	reqBad.Header.Set("Authorization", "Bearer "+userToken)
	reqBad.Header.Set("Content-Type", "application/json")
	wBad := httptest.NewRecorder()
	router.ServeHTTP(wBad, reqBad)
	if wBad.Code != http.StatusBadRequest {
		t.Errorf("Esperado 400 Bad Request, recibido: %d", wBad.Code)
	}

	// 3. READ - Exitoso (200)
	reqGet, _ := http.NewRequest("GET", "/api/v1/posts/"+postID, nil)
	wGet := httptest.NewRecorder()
	router.ServeHTTP(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Errorf("Esperado 200 OK al leer post, recibido: %d", wGet.Code)
	}

	// 4. READ - Inexistente (404)
	req404, _ := http.NewRequest("GET", "/api/v1/posts/non-existent-uuid", nil)
	w404 := httptest.NewRecorder()
	router.ServeHTTP(w404, req404)
	if w404.Code != http.StatusNotFound {
		t.Errorf("Esperado 404 Not Found, recibido: %d", w404.Code)
	}

	// 5. UPDATE - Sin permisos (403 - otro usuario intenta editar)
	cfg := config.LoadConfig()
	otherUserToken, _, _ := middleware.GenerateTokens("a0000000-0000-0000-0000-000000000004", "newbie_user", models.RoleUser, time.Hour, 24*time.Hour, cfg.JWTSecret)

	reqPatchForbidden, _ := http.NewRequest("PATCH", "/api/v1/posts/"+postID, bytes.NewBuffer([]byte(`{"body_text":"Hackeado"}`)))
	reqPatchForbidden.Header.Set("Authorization", "Bearer "+otherUserToken)
	reqPatchForbidden.Header.Set("Content-Type", "application/json")
	wForbidden := httptest.NewRecorder()
	router.ServeHTTP(wForbidden, reqPatchForbidden)
	if wForbidden.Code != http.StatusForbidden {
		t.Errorf("Esperado 403 Forbidden al editar post ajeno, recibido: %d", wForbidden.Code)
	}

	// 6. UPDATE - Exitoso (200) por el autor original
	reqPatch, _ := http.NewRequest("PATCH", "/api/v1/posts/"+postID, bytes.NewBuffer([]byte(`{"body_text":"Texto actualizado correctamente"}`)))
	reqPatch.Header.Set("Authorization", "Bearer "+userToken)
	reqPatch.Header.Set("Content-Type", "application/json")
	wPatch := httptest.NewRecorder()
	router.ServeHTTP(wPatch, reqPatch)
	if wPatch.Code != http.StatusOK {
		t.Errorf("Esperado 200 OK al actualizar post, recibido: %d", wPatch.Code)
	}

	// 7. DELETE - Sin permisos (403)
	reqDelForbidden, _ := http.NewRequest("DELETE", "/api/v1/posts/"+postID, nil)
	reqDelForbidden.Header.Set("Authorization", "Bearer "+otherUserToken)
	wDelForbid := httptest.NewRecorder()
	router.ServeHTTP(wDelForbid, reqDelForbidden)
	if wDelForbid.Code != http.StatusForbidden {
		t.Errorf("Esperado 403 Forbidden al eliminar post ajeno, recibido: %d", wDelForbid.Code)
	}

	// 8. DELETE - Exitoso (200) por autor original
	reqDel, _ := http.NewRequest("DELETE", "/api/v1/posts/"+postID, nil)
	reqDel.Header.Set("Authorization", "Bearer "+userToken)
	wDel := httptest.NewRecorder()
	router.ServeHTTP(wDel, reqDel)
	if wDel.Code != http.StatusOK {
		t.Errorf("Esperado 200 OK al eliminar post propio, recibido: %d", wDel.Code)
	}

	// 9. READ tras DELETE - (404)
	reqGetDeleted, _ := http.NewRequest("GET", "/api/v1/posts/"+postID, nil)
	wGetDel := httptest.NewRecorder()
	router.ServeHTTP(wGetDel, reqGetDeleted)
	if wGetDel.Code != http.StatusNotFound {
		t.Errorf("Esperado 404 tras borrado lógico, recibido: %d", wGetDel.Code)
	}
}

// TestCommunityCreationValidation prueba validación de karma y conflicto de nombres
func TestCommunityCreationValidation(t *testing.T) {
	router, _, cfg, userToken, _ := setupTestServer()

	// 1. Usuario con karma suficiente (kiba_dev, karma 250 >= 100) -> 201 Created
	commBody := models.CreateCommunityRequest{
		Name:        "rust-lang",
		Description: "Comunidad de Rust en español",
	}
	b, _ := json.Marshal(commBody)
	req, _ := http.NewRequest("POST", "/api/v1/communities", bytes.NewBuffer(b))
	req.Header.Set("Authorization", "Bearer "+userToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 Created al crear comunidad con karma >= 100, recibido: %d", w.Code)
	}

	// 2. Conflicto de nombre duplicado -> 409 Conflict
	reqDup, _ := http.NewRequest("POST", "/api/v1/communities", bytes.NewBuffer(b))
	reqDup.Header.Set("Authorization", "Bearer "+userToken)
	reqDup.Header.Set("Content-Type", "application/json")
	wDup := httptest.NewRecorder()
	router.ServeHTTP(wDup, reqDup)
	if wDup.Code != http.StatusConflict {
		t.Errorf("Esperado 409 Conflict con nombre duplicado, recibido: %d", wDup.Code)
	}

	// 3. Usuario con karma insuficiente (newbie_user, karma 10 < 100) -> 403 Forbidden
	lowKarmaToken, _, _ := middleware.GenerateTokens("a0000000-0000-0000-0000-000000000004", "newbie_user", models.RoleUser, time.Hour, 24*time.Hour, cfg.JWTSecret)
	commBody2 := models.CreateCommunityRequest{
		Name:        "python-latam",
		Description: "Comunidad de Python",
	}
	b2, _ := json.Marshal(commBody2)
	reqLow, _ := http.NewRequest("POST", "/api/v1/communities", bytes.NewBuffer(b2))
	reqLow.Header.Set("Authorization", "Bearer "+lowKarmaToken)
	reqLow.Header.Set("Content-Type", "application/json")
	wLow := httptest.NewRecorder()
	router.ServeHTTP(wLow, reqLow)
	if wLow.Code != http.StatusForbidden {
		t.Errorf("Esperado 403 Forbidden al crear comunidad con karma < 100, recibido: %d", wLow.Code)
	}
}
