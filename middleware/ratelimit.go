package middleware

import (
	"net/http"
	"sync"
	"time"

	"forfunable/models"
	"github.com/gin-gonic/gin"
)

type clientLimit struct {
	count       int
	windowStart time.Time
}

type RateLimiter struct {
	mu      sync.Mutex
	clients map[string]*clientLimit
	limit   int
	window  time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		clients: make(map[string]*clientLimit),
		limit:   limit,
		window:  window,
	}

	// Limpieza periódica de entradas viejas
	go func() {
		for {
			time.Sleep(window * 2)
			rl.mu.Lock()
			now := time.Now()
			for ip, entry := range rl.clients {
				if now.Sub(entry.windowStart) > window*2 {
					delete(rl.clients, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()

	return rl
}

func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP()
		if uid, exists := c.Get("user_id"); exists {
			key = uid.(string)
		}

		rl.mu.Lock()
		now := time.Now()
		entry, exists := rl.clients[key]
		if !exists || now.Sub(entry.windowStart) > rl.window {
			rl.clients[key] = &clientLimit{
				count:       1,
				windowStart: now,
			}
			rl.mu.Unlock()
			c.Next()
			return
		}

		if entry.count >= rl.limit {
			rl.mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, models.ErrorResponse{
				Error:   "TOO_MANY_REQUESTS",
				Message: "Límite de peticiones alcanzado. Por favor, intente más tarde.",
			})
			return
		}

		entry.count++
		rl.mu.Unlock()
		c.Next()
	}
}
