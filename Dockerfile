# ==============================================================================
# Dockerfile Multi-Stage para Forfunable API (Google Cloud Run + Cloud SQL)
# ==============================================================================

# --- Etapa 1: Build de la aplicación Go ---
FROM golang:1.27.1-alpine AS builder

WORKDIR /app

# Instalar dependencias de build del sistema si son necesarias
RUN apk add --no-cache git ca-certificates tzdata

# Descargar módulos (aprovechando cache de capas)
COPY go.mod go.sum ./
RUN go mod download

# Copiar el código fuente completo
COPY . .

# Compilar binario estático sin CGO para máxima portabilidad y seguridad
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -extldflags '-static'" \
    -o /app/forfunable-api .

# --- Etapa 2: Imagen Final Minimalista de Producción ---
FROM alpine:3.21

# Instalar certificados CA actualizados y soporte de zona horaria
RUN apk --no-cache add ca-certificates tzdata && \
    addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup

WORKDIR /app

# Crear directorio para socket de Cloud SQL con permisos adecuados
RUN mkdir -p /cloudsql && chown -R appuser:appgroup /cloudsql

# Copiar binario compilado desde la etapa builder
COPY --from=builder /app/forfunable-api /app/forfunable-api
COPY --from=builder /app/openapi.yaml /app/openapi.yaml

# Asignar propiedad a usuario sin privilegios
RUN chown -R appuser:appgroup /app

# Cambiar a usuario sin privilegios
USER appuser

# Variables de entorno por defecto (Cloud Run inyecta PORT automáticamente)
ENV PORT=8080 \
    GIN_MODE=release \
    ENVIRONMENT=production

# Exponer el puerto de Cloud Run
EXPOSE 8080

# Ejecutar el binario de la aplicación
ENTRYPOINT ["/app/forfunable-api"]
