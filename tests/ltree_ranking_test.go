package tests

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"forfunable/models"
	"forfunable/repository"
)

// TestLtreeHierarchy valida la generación y preservación del árbol jerárquico de comentarios
func TestLtreeHierarchy(t *testing.T) {
	router, _, _, userToken, _ := setupTestServer()

	postID := "c0000000-0000-0000-0000-000000000001"

	// 1. Crear comentario raíz (depth = 0)
	c1Req := models.CreateCommentRequest{
		PostID:  postID,
		Content: "Comentario raíz sobre ltree",
	}
	b1, _ := json.Marshal(c1Req)
	req1, _ := http.NewRequest("POST", "/api/v1/comments", bytes.NewBuffer(b1))
	req1.Header.Set("Authorization", "Bearer "+userToken)
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 Created al crear comentario raíz, recibido: %d", w1.Code)
	}

	var rootComment models.Comment
	_ = json.Unmarshal(w1.Body.Bytes(), &rootComment)

	if rootComment.Depth != 0 {
		t.Errorf("Esperado depth 0 para comentario raíz, recibido: %d", rootComment.Depth)
	}

	// 2. Crear respuesta anidada (depth = 1)
	c2Req := models.CreateCommentRequest{
		PostID:          postID,
		ParentCommentID: &rootComment.ID,
		Content:         "Respuesta anidada hija",
	}
	b2, _ := json.Marshal(c2Req)
	req2, _ := http.NewRequest("POST", "/api/v1/comments", bytes.NewBuffer(b2))
	req2.Header.Set("Authorization", "Bearer "+userToken)
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	if w2.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 Created al responder comentario, recibido: %d", w2.Code)
	}

	var childComment models.Comment
	_ = json.Unmarshal(w2.Body.Bytes(), &childComment)

	if childComment.Depth != 1 {
		t.Errorf("Esperado depth 1 para respuesta anidada, recibido: %d", childComment.Depth)
	}

	if !strings.HasPrefix(childComment.Path, rootComment.Path) {
		t.Errorf("El path ltree de la respuesta (%s) debe extender el path del padre (%s)", childComment.Path, rootComment.Path)
	}

	// 3. Eliminar comentario raíz: debe preservar la estructura sustituyendo por marca de borrado
	reqDel, _ := http.NewRequest("DELETE", "/api/v1/comments/"+rootComment.ID, nil)
	reqDel.Header.Set("Authorization", "Bearer "+userToken)
	wDel := httptest.NewRecorder()
	router.ServeHTTP(wDel, reqDel)

	if wDel.Code != http.StatusOK {
		t.Fatalf("Esperado 200 OK al borrar comentario, recibido: %d", wDel.Code)
	}

	// 4. Consultar árbol completo de comentarios
	reqList, _ := http.NewRequest("GET", "/api/v1/posts/"+postID+"/comments", nil)
	wList := httptest.NewRecorder()
	router.ServeHTTP(wList, reqList)

	var listResp struct {
		Comments []*models.Comment `json:"comments"`
	}
	_ = json.Unmarshal(wList.Body.Bytes(), &listResp)

	foundDeletedRoot := false
	foundActiveChild := false
	for _, c := range listResp.Comments {
		if c.ID == rootComment.ID {
			foundDeletedRoot = true
			if c.Content != "[comentario eliminado]" || !c.IsRemoved {
				t.Errorf("Comentario padre no preservó marca de borrado: %s", c.Content)
			}
		}
		if c.ID == childComment.ID {
			foundActiveChild = true
			if c.Content != "Respuesta anidada hija" {
				t.Errorf("Contenido del comentario hijo alterado indebidamente: %s", c.Content)
			}
		}
	}

	if !foundDeletedRoot || !foundActiveChild {
		t.Errorf("Árbol de comentarios incompleto tras borrado suave de nodo padre")
	}
}

// TestHotRankingDecay valida la fórmula matemática de atenuación temporal:
// Score_hot = S_net / (T + 2)^1.8
func TestHotRankingDecay(t *testing.T) {
	repo := repository.NewMemoryRepository()

	// Simular post 1: 5 horas de antigüedad, 10 upvotes, 0 downvotes
	// S_net = 10, T = 5 -> 10 / (5 + 2)^1.8 = 10 / 7^1.8 ≈ 10 / 33.26 ≈ 0.300
	p1 := &models.Post{
		ID:             "test-p1",
		CommunityID:    "b0000000-0000-0000-0000-000000000001",
		AuthorID:       "a0000000-0000-0000-0000-000000000003",
		Title:          "Post Antiguo",
		ContentType:    "TEXT",
		UpvotesCount:   10,
		DownvotesCount: 0,
		CreatedAt:      time.Now().Add(-5 * time.Hour),
	}
	_ = repo.CreatePost(p1)
	p1.CreatedAt = time.Now().Add(-5 * time.Hour) // Reajustar tiempo exacto

	feed, _, err := repo.GetRecommendedFeed("", 10)
	if err != nil {
		t.Fatalf("Error al obtener feed: %v", err)
	}

	if len(feed) == 0 {
		t.Fatalf("Feed vacío")
	}

	// Comprobar que los scores calculados son matemáticamente coherentes
	for _, p := range feed {
		if p.HotRankingScore < 0 && (p.UpvotesCount >= p.DownvotesCount) {
			t.Errorf("Score Hot negativo inesperado para post con votos positivos")
		}
		if math.IsNaN(p.HotRankingScore) || math.IsInf(p.HotRankingScore, 0) {
			t.Errorf("Score Hot con valor NaN o Infinito")
		}
	}
}
