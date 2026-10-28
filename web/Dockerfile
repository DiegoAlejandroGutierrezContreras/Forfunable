# ==============================================================================
# Dockerfile Multi-Stage para Forfunable Web (Next.js standalone en Cloud Run)
# ==============================================================================

# --- Etapa 1: Dependencias ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# --- Etapa 2: Build ---
FROM node:22-alpine AS builder
WORKDIR /app

# URL de Cloud Run del backend. Las rewrites de next.config.js se fijan en el build.
ARG BACKEND_URL
ENV BACKEND_URL=${BACKEND_URL} \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Etapa 3: Imagen Final Minimalista ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static

USER appuser
EXPOSE 8080

CMD ["node", "server.js"]
