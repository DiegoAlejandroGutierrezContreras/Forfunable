# UX_MAPPING.md — Mapeo de Experiencia de Usuario, Enrutamiento y Contratos de Servicio (Forfunable)

Este documento actúa como la **Fuente de Verdad de Frontend y UX** para la plataforma **Forfunable**. Mapea cada vista y pantalla diseñada en Google Stitch (`projects/2110342192982139426`) con sus rutas en Next.js (App Router), contratos RESTful reales (`/api/v1/`), flujos de usuario y los 4 estados de interfaz obligatorios.

---

## 1. Tabla Maestra de Enrutamiento y Pantallas Stitch

| Ruta (Next.js) | Pantalla Stitch ID / Título | Propósito y Contenido | Endpoints Relacionados | Métodos |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `25fbaa23...` (01-02 Iniciar sesión y autenticación segura) | Formulario de autenticación con reCAPTCHA | `/api/v1/auth/login` | `POST` |
| `/register` | `0e0682f8...` (06-85 Identidad verificada) | Registro de nuevos usuarios y validación | `/api/v1/auth/register` | `POST` |
| `/` | `9df7d014...` (02-14 Feed principal) | Feed algorítmico global (Hot Ranking Decay) | `/api/v1/recommendations/feed`, `/api/v1/posts` | `GET` |
| `/c/create` | `d592ea69...` (02-13 Crear comunidad y validación de karma) | Creación de comunidad (exige Karma $\ge$ 100) | `/api/v1/communities` | `POST` |
| `/c/[slug]` | `3e72c75a...` (04-24 Gobernanza comunitaria) | Página principal de foro/comunidad específica | `/api/v1/communities/{name}`, `/api/v1/posts` | `GET` |
| `/c/[slug]/posts/[id]` | `1455bf69...` (02-17 Detalle de publicación y discusión) | Hilo de discusión y árbol de comentarios `ltree` | `/api/v1/posts/{id}`, `/api/v1/posts/{id}/comments` | `GET`, `POST` |
| `/c/[slug]/submit` | `eba9bedcd...` (02-15 Previsualización y validación) | Editor de publicación con Markdown y subida GCS | `/api/v1/posts`, `/api/v1/posts/media-upload-url` | `POST` |
| `/search` | `a38ff29d...` (02-18 Búsqueda técnica avanzada) | Buscador predictivo y filtrado facetado | `/api/v1/search/predictive` | `GET` |
| `/notifications` | `f4bfe40f...` (03-20 Notificaciones agrupadas) | Centro de alertas y notificaciones leídas/no leídas | `/api/v1/notifications`, `/api/v1/notifications/{id}/read` | `GET`, `PATCH` |
| `/chat` | `25d0c2c1...` (04-27 Nueva solicitud de chat) | Bandeja de mensajería privada y solicitudes | `/api/v1/chats/conversations`, `/api/v1/chats/requests` | `GET`, `POST` |
| `/u/[username]` | `55239598...` (01-10 Desglose de karma y rangos) | Perfil público, actividad y desglose de karma | `/api/v1/users/{username}`, `/api/v1/users/{id}/karma` | `GET` |
| `/settings/profile` | `f02d5776...` (01-05 Estado de presencia y visibilidad) | Configuración de avatar, biografía y presencia | `/api/v1/users/me/profile`, `/api/v1/users/me/status` | `PATCH` |
| `/admin` | `1efbdbe8...` (05-42 Gestión de Roles y Permisos) | Panel de administración global y auditoría inmutable | `/api/v1/admin/users`, `/api/v1/admin/audit/logs` | `GET`, `PATCH` |
| `/mod/queue` | `3b46fd38...` (05-36 Registro de auditoría de moderación) | Cola de reportes y denuncias de comunidad | `/api/v1/admin/moderation/reports` | `GET`, `POST` |

---

## 2. Los 4 Estados Obligatorios de UI (UI States Matrix)

Cada componente de vista en Next.js debe implementar rigurosamente los 4 estados siguientes sin excepciones:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Loading State (Skeleton Obsidian Signal con shimmer)     │
├─────────────────────────────────────────────────────────────┤
│ 2. Success State (Renderizado de datos reales tipados)      │
├─────────────────────────────────────────────────────────────┤
│ 3. Empty State (Ilustración o ícono temático + Call to Action)│
├─────────────────────────────────────────────────────────────┤
│ 4. Error State (Alerta destructiva + Botón de reintento)    │
└─────────────────────────────────────────────────────────────┘
```

### Especificación Detallada de Estados

1. **Estado de Carga (`Loading`):**
   * Usar componentes `<Skeleton />` estilizados con el color base `#1c1a24` y brillo en `#2b2933`.
   * Prohibido usar spinners genéricos de pantalla completa; el skeleton debe respetar el layout final (Cards, Avatares, Hilos).

2. **Estado Exitoso (`Success`):**
   * Datos tipados con interfaces TypeScript sincronizadas con los DTOs de `models/dtos.go`.
   * Aplicación estricta de tokens de tipografía (`Space Grotesk` para métricas/titulares, `Inter` para cuerpos).

3. **Estado Vacío (`Empty State`):**
   * Feed sin publicaciones: Pantalla limpia con ícono atenuado en `#605874`, texto "Aún no hay publicaciones en este foro" y botón primario `#00e676` "Crear la primera publicación".
   * Sin notificaciones: "Estás al día. No hay alertas pendientes".

4. **Estado de Error (`Error State`):**
   * Tarjeta con borde `#ffdad6` y fondo atenuado de alerta.
   * Mensaje claro del fallo (RFC 9110) y botón de reintento (`refetch()`).
   * Manejo diferenciado de códigos HTTP: `401` (Redirección a `/login`), `403` (Falta de karma/permisos), `429` (Pantalla Stitch `06-64 Límite de peticiones excedido`).

---

## 3. Contratos de Servicios y Payloads (Especificación API)

### 3.1 Autenticación (`/api/v1/auth`)

#### `POST /api/v1/auth/login`
* **Request:**
```json
{
  "email": "usuario@forfunable.com",
  "password": "Password123!",
  "recaptcha_token": "token_recaptcha_v3"
}
```
* **Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "uuid-v4",
    "username": "kiba_dev",
    "email": "usuario@forfunable.com",
    "role": "USER",
    "karma_score": 120
  }
}
```
*(El `refresh_token` se asigna automáticamente mediante cookie segura `HttpOnly`, `SameSite=Strict`, `Secure`).*

---

### 3.2 Comunidades (`/api/v1/communities`)

#### `POST /api/v1/communities`
* **Restricción:** Requiere `karma_score >= 100`. Si es menor, la API retorna `403 Forbidden` (`INSUFFICIENT_KARMA`).
* **Request:**
```json
{
  "name": "golang-latam",
  "title": "Comunidad de Go en Español",
  "description": "Debates de concurrencia, backend y arquitectura cloud en Go.",
  "rules": "1. Respeta las directrices técnicas. 2. No spam."
}
```
* **Response (201 Created):**
```json
{
  "id": "uuid-v4",
  "name": "golang-latam",
  "title": "Comunidad de Go en Español",
  "created_at": "2026-10-26T21:00:00Z"
}
```

---

### 3.3 Publicaciones y Votación Write-Behind

#### `POST /api/v1/posts`
* **Request:**
```json
{
  "community_id": "uuid-v4",
  "title": "Patrones de Concurrencia en Go para Cloud Run",
  "content": "Analizamos worker pools y canales con context...",
  "media_urls": []
}
```

#### `POST /api/v1/votes/posts/{id}`
* **Request:**
```json
{
  "vote_type": 1
}
```
*(Valores permitidos: `1` para upvote, `-1` para downvote, `0` para revocar voto).*
* **Comportamiento UI:** Actualización optimista inmediata en el cliente; el backend procesa el karma y balance mediante el buffer en memoria write-behind.

---

### 3.4 Comentarios Anidados con Jerarquía `ltree`

#### `GET /api/v1/posts/{id}/comments`
* **Response (200 OK):**
```json
[
  {
    "id": "c1",
    "path": "root.c1",
    "depth": 1,
    "author": "diego_go",
    "content": "Excelente enfoque con ltree para evitar CTEs recursivas.",
    "net_votes": 14,
    "created_at": "2026-10-26T21:05:00Z"
  },
  {
    "id": "c2",
    "path": "root.c1.c2",
    "depth": 2,
    "author": "kiba_dev",
    "content": "Totalmente, el índice GiST responde en <5ms.",
    "net_votes": 8,
    "created_at": "2026-10-26T21:07:00Z"
  }
]
```

---

## 4. Directrices de Seguridad Frontend (NotebookLM Notebook: `de38e9a0-371e-4bfa-a5c2-b8bf5b65d5f2`)

1. **Sanitización de Markdown:** Todo contenido generado por usuarios en hilos y comentarios debe pasar por un parser seguro con lista blanca estricta (ej. `DOMPurify` / `rehype-sanitize`) para neutralizar ataques XSS. Prohibido el uso de `dangerouslySetInnerHTML` sin sanitización previa.
2. **Políticas CSP (Content Security Policy):**
   * `default-src 'self'`
   * `connect-src 'self' https://stitch.googleapis.com https://*.run.app`
   * `img-src 'self' data: https://storage.googleapis.com`
3. **Manejo de Tokens en Cliente:**
   * El `access_token` se almacena exclusivamente en memoria o estado reactivo de la aplicación.
   * Prohibido almacenar tokens JWT en `localStorage` o `sessionStorage`.
4. **Protección CSRF:** Validar tokens CSRF en encabezados `X-CSRF-Token` para todas las mutaciones (`POST`, `PATCH`, `DELETE`).
5. **Protección Perimetral y Bots:** Formulario de Login, Registro y Creación de Comunidad integran tokens de `reCAPTCHA Enterprise`.
