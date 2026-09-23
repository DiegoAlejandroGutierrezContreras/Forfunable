package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"forfunable/models"
)

func TestAuthAndRBAC(t *testing.T) {
	router, _, _, userToken, adminToken := setupTestServer()

	// 1. Registro exitoso (201)
	regBody := models.RegisterRequest{
		Username: "tester_pro",
		Email:    "tester@example.com",
		Password: "Password123!",
	}
	bReg, _ := json.Marshal(regBody)
	reqReg, _ := http.NewRequest("POST", "/api/v1/auth/register", bytes.NewBuffer(bReg))
	reqReg.Header.Set("Content-Type", "application/json")
	wReg := httptest.NewRecorder()
	router.ServeHTTP(wReg, reqReg)

	if wReg.Code != http.StatusCreated {
		t.Fatalf("Esperado 201 Created en registro, recibido: %d, body: %s", wReg.Code, wReg.Body.String())
	}

	// 2. Registro duplicado (409 Conflict)
	reqRegDup, _ := http.NewRequest("POST", "/api/v1/auth/register", bytes.NewBuffer(bReg))
	reqRegDup.Header.Set("Content-Type", "application/json")
	wRegDup := httptest.NewRecorder()
	router.ServeHTTP(wRegDup, reqRegDup)

	if wRegDup.Code != http.StatusConflict {
		t.Errorf("Esperado 409 Conflict al registrar email existente, recibido: %d", wRegDup.Code)
	}

	// 3. Login exitoso (200 OK)
	loginBody := models.LoginRequest{
		Email:    "tester@example.com",
		Password: "Password123!",
	}
	bLogin, _ := json.Marshal(loginBody)
	reqLogin, _ := http.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(bLogin))
	reqLogin.Header.Set("Content-Type", "application/json")
	wLogin := httptest.NewRecorder()
	router.ServeHTTP(wLogin, reqLogin)

	if wLogin.Code != http.StatusOK {
		t.Fatalf("Esperado 200 OK en login, recibido: %d", wLogin.Code)
	}

	var authResp models.AuthResponse
	_ = json.Unmarshal(wLogin.Body.Bytes(), &authResp)
	if authResp.AccessToken == "" || authResp.RefreshToken == "" {
		t.Errorf("Tokens no emitidos en login")
	}

	// 4. Login con contraseña errónea (401 Unauthorized)
	badLogin := models.LoginRequest{
		Email:    "tester@example.com",
		Password: "WrongPassword999!",
	}
	bBadLogin, _ := json.Marshal(badLogin)
	reqBadLogin, _ := http.NewRequest("POST", "/api/v1/auth/login", bytes.NewBuffer(bBadLogin))
	reqBadLogin.Header.Set("Content-Type", "application/json")
	wBadLogin := httptest.NewRecorder()
	router.ServeHTTP(wBadLogin, reqBadLogin)

	if wBadLogin.Code != http.StatusUnauthorized {
		t.Errorf("Esperado 401 Unauthorized, recibido: %d", wBadLogin.Code)
	}

	// 5. Renovación de token refresh (200 OK)
	refBody := models.RefreshTokenRequest{RefreshToken: authResp.RefreshToken}
	bRef, _ := json.Marshal(refBody)
	reqRef, _ := http.NewRequest("POST", "/api/v1/auth/refresh", bytes.NewBuffer(bRef))
	reqRef.Header.Set("Content-Type", "application/json")
	wRef := httptest.NewRecorder()
	router.ServeHTTP(wRef, reqRef)

	if wRef.Code != http.StatusOK {
		t.Errorf("Esperado 200 OK al renovar token, recibido: %d", wRef.Code)
	}

	// 6. RBAC: Usuario regular intentando borrar contenido en moderación administrativa (403 Forbidden)
	reqAdminForbid, _ := http.NewRequest("DELETE", "/api/v1/admin/moderation/content/c0000000-0000-0000-0000-000000000001/remove", nil)
	reqAdminForbid.Header.Set("Authorization", "Bearer "+userToken)
	wAdminForbid := httptest.NewRecorder()
	router.ServeHTTP(wAdminForbid, reqAdminForbid)

	if wAdminForbid.Code != http.StatusForbidden {
		t.Errorf("Esperado 403 Forbidden para usuario sin rol de administrador, recibido: %d", wAdminForbid.Code)
	}

	// 7. RBAC: Global Admin accediendo al endpoint administrativo (200 OK)
	reqAdminOk, _ := http.NewRequest("DELETE", "/api/v1/admin/moderation/content/c0000000-0000-0000-0000-000000000001/remove", nil)
	reqAdminOk.Header.Set("Authorization", "Bearer "+adminToken)
	wAdminOk := httptest.NewRecorder()
	router.ServeHTTP(wAdminOk, reqAdminOk)

	if wAdminOk.Code != http.StatusOK {
		t.Errorf("Esperado 200 OK para Global Admin en endpoint administrativo, recibido: %d", wAdminOk.Code)
	}
}

func TestPrintTokens(t *testing.T) {
	_, _, cfg, userToken, adminToken := setupTestServer()
	t.Logf("USER_TOKEN: %s", userToken)
	t.Logf("ADMIN_TOKEN: %s", adminToken)
	t.Logf("SECRET: %s", cfg.JWTSecret)
}
