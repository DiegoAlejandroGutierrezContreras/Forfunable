package middleware

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"forfunable/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type JWTClaims struct {
	UserID     string `json:"user_id"`
	Username   string `json:"username"`
	GlobalRole string `json:"global_role"`
	TokenType  string `json:"token_type"` // "access" o "refresh"
	jwt.RegisteredClaims
}

// GenerateTokens crea el par de tokens (Access y Refresh)
func GenerateTokens(userID, username, globalRole string, accessTTL, refreshTTL time.Duration, secret string) (string, string, error) {
	now := time.Now()

	// 1. Access Token
	accessClaims := JWTClaims{
		UserID:     userID,
		Username:   username,
		GlobalRole: globalRole,
		TokenType:  "access",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(accessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "forfunable-backend",
			Subject:   userID,
		},
	}
	accessTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessToken, err := accessTokenObj.SignedString([]byte(secret))
	if err != nil {
		return "", "", err
	}

	// 2. Refresh Token
	refreshClaims := JWTClaims{
		UserID:     userID,
		Username:   username,
		GlobalRole: globalRole,
		TokenType:  "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(refreshTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "forfunable-backend",
			Subject:   userID,
		},
	}
	refreshTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err := refreshTokenObj.SignedString([]byte(secret))
	if err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

// ParseAndValidateToken decodifica y verifica la firma y vigencia del JWT
func ParseAndValidateToken(tokenStr, secret string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("método de firma no válido")
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("token inválido")
}

// AuthRequired intercepta peticiones que requieren autenticación válida
func AuthRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		var tokenStr string

		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
				tokenStr = parts[1]
			}
		}

		// Si no viene en cabecera, revisar cookie de sesión
		if tokenStr == "" {
			if cookie, err := c.Cookie("access_token"); err == nil {
				tokenStr = cookie
			}
		}

		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "UNAUTHORIZED",
				Message: "Se requiere token de autorización (Bearer <token>)",
			})
			return
		}

		claims, err := ParseAndValidateToken(tokenStr, secret)
		if err != nil || claims.TokenType != "access" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "INVALID_TOKEN",
				Message: "Token de acceso inválido o expirado",
			})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("global_role", claims.GlobalRole)
		c.Next()
	}
}

// OptionalAuth extrae el usuario si el token está presente, pero no aborta si falta
func OptionalAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
				if claims, err := ParseAndValidateToken(parts[1], secret); err == nil && claims.TokenType == "access" {
					c.Set("user_id", claims.UserID)
					c.Set("username", claims.Username)
					c.Set("global_role", claims.GlobalRole)
				}
			}
		}
		c.Next()
	}
}
