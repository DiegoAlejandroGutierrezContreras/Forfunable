package middleware

import (
	"net/http"

	"forfunable/models"
	"github.com/gin-gonic/gin"
)

// RequireRole valida que el usuario autenticado cuente con alguno de los roles globales requeridos
func RequireRole(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		roleVal, exists := c.Get("global_role")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error:   "UNAUTHORIZED",
				Message: "Acceso no autorizado",
			})
			return
		}

		userRole := roleVal.(string)

		// GLOBAL_ADMIN siempre tiene acceso irrestricto
		if userRole == models.RoleGlobalAdmin {
			c.Next()
			return
		}

		for _, allowed := range allowedRoles {
			if userRole == allowed {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "FORBIDDEN",
			Message: "No tienes los permisos ni el rol necesario para esta operación",
		})
	}
}
