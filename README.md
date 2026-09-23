# Forfunable - Plataforma de Comunidades Interactivas (Backend en Go)

Plataforma de foros de discusión y comunidades interactivas (tipo Reddit) desarrollada en **Go 1.27** con el framework **Gin**, optimizada para baja latencia (<20ms cold start) y alta escalabilidad en **Google Cloud Platform (GCP)** sobre **Cloud Run** y **Cloud SQL PostgreSQL**.

---

## Características Principales

1. **Jerarquía de Comentarios con ltree**:
   - Uso de la extensión nativa `ltree` de PostgreSQL indexada con **GiST** para recuperar árboles y subárboles completos de comentarios en una única consulta plana, eliminando consultas recursivas `WITH RECURSIVE`.
   - Borrado suave (*soft-delete*) que preserva la estructura del árbol de comentarios sustituyendo el contenido por `[comentario eliminado]`.
2. **Seguridad y Control RBAC (RFC 9110)**:
   - Segregación estricta entre endpoints de cliente final (`/api/v1/`) y endpoints administrativos/moderación (`/api/v1/admin/`).
   - Roles globales: `USER`, `COMMUNITY_MOD`, `GLOBAL_ADMIN`.
   - Roles locales de comunidad: `OWNER`, `LEAD_MOD`, `MOD`.
   - Restricción de creación de comunidades: Requiere `karma_score >= 100`.
   - Sanitización contra inyecciones XSS y validación de tipos MIME multimedia.
3. **Algoritmo de Atenuación Temporal (Hot Ranking Decay)**:
   - Ordenamiento dinámico en `/api/v1/recommendations/feed` basado en:
     $$Score_{hot} = \frac{S_{net}}{(T+2)^{1.8}}$$
4. **Patrón Write-Behind para Votación Masiva**:
   - Separación física de tablas `post_votes` y `comment_votes` para evitar *table locks*.
5. **Cero Secretos Hardcodeados**:
   - Gestión integral mediante variables de entorno configurables para Google Secret Manager.
6. **Especificación OpenAPI 3.0**:
   - Documentación completa en [`openapi.yaml`](./openapi.yaml).

---

## Estructura del Proyecto

```
Forfunable/
├── main.go                     # Punto de entrada y montaje del router Gin
├── openapi.yaml                # Especificación OpenAPI 3.0 completa
├── TROUBLESHOOTING.md          # Registro continuo de decisiones y solución de problemas
├── database/
│   ├── schema.sql              # DDL PostgreSQL con ltree, enums, FKs, CHECKs e índices GiST
│   └── seeds.sql               # Datos iniciales para pruebas
├── models/
│   ├── models.go               # Entidades de dominio
│   └── dtos.go                 # Data Transfer Objects (DTOs) con validaciones Gin
├── repository/
│   ├── repository.go           # Interfaz unificada de persistencia
│   ├── memory_repo.go          # Implementación en memoria thread-safe (seed precargado)
│   └── postgres_repo.go        # Implementación nativa para Cloud SQL PostgreSQL
├── middleware/
│   ├── auth.go                 # JWT authentication y claims extraction
│   ├── rbac.go                 # Control de acceso basado en roles globales y de comunidad
│   ├── ratelimit.go            # Limitador de tasa (429 Too Many Requests)
│   └── security.go             # Cabeceras de seguridad y sanitización contra XSS
├── handlers/                   # Handlers RESTful para todos los 56 endpoints
├── tests/                      # Suite de pruebas automatizadas unitarias y de integración
├── bruno/                      # Colección nativa en formato directorio de Bruno
│   ├── bruno.json
│   ├── environments/local.bru
│   └── 01-Auth/ ...
└── Forfunable_Bruno_Collection.json # Colección de Bruno importable en 1 clic
```

---

## Cómo Ejecutar el Servidor

### 1. Ejecución Rápida (Desarrollo Local / Pruebas con Bruno)
El backend cuenta con persistencia en memoria precargada con datos semilla. Puedes iniciar el servidor de inmediato sin necesidad de levantar servicios externos:

```powershell
go run main.go
```
El servidor se iniciará en `http://localhost:8080`.

### 2. Ejecución con Base de Datos PostgreSQL (Cloud SQL)
1. Ejecuta el esquema y los datos iniciales en tu base de datos:
   ```bash
   psql -U postgres -d forfunable -f database/schema.sql
   psql -U postgres -d forfunable -f database/seeds.sql
   ```
2. Inicia la aplicación pasando la variable de entorno de conexión:
   ```powershell
   $env:DATABASE_URL="postgres://postgres:tu_password@localhost:5432/forfunable?sslmode=disable"
   go run main.go
   ```

---

## Pruebas de Endpoints con Bruno

El proyecto incluye dos modalidades para probar en **Bruno**:

### Opción A: Abrir Colección como Carpeta
1. Abre **Bruno**.
2. Haz clic en **Open Collection**.
3. Selecciona la carpeta `Forfunable/bruno`.
4. Selecciona el entorno `local`.
5. Ejecuta la petición `01-Auth/login` para obtener el token activo y probar cualquier endpoint.

### Opción B: Importar Archivo Único (1 Clic)
1. En Bruno, haz clic en **Import Collection**.
2. Selecciona el archivo [`Forfunable_Bruno_Collection.json`](./Forfunable_Bruno_Collection.json).
3. Todas las 56 peticiones organizadas por los 10 módulos se cargarán listas para probar.

### Usuarios Precargados para Pruebas:
| Usuario | Rol Global | Karma | Contraseña | Propósito |
| :--- | :--- | :--- | :--- | :--- |
| `kiba_dev` | `USER` | 250 | `Password123!` | Puede crear comunidades (Karma >= 100), posts y votar |
| `admin_master` | `GLOBAL_ADMIN` | 9999 | `Password123!` | Acceso completo a `/api/v1/admin/*` |
| `mod_diego` | `COMMUNITY_MOD` | 500 | `Password123!` | Moderación local en la comunidad `golang` |
| `newbie_user` | `USER` | 10 | `Password123!` | Usuario recién registrado (Karma < 100) |

---

## Ejecución de Pruebas Automatizadas

Para validar que todos los endpoints, el control RBAC, las operaciones CRUD, el árbol `ltree` y el algoritmo de ranking funcionan al 100%:

```powershell
go test -v ./tests/...
```
