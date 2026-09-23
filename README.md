# Forfunable - Plataforma de Comunidades Interactivas (Backend en Go)

Plataforma de foros de discusión y comunidades interactivas (tipo Reddit) desarrollada en **Go** con el framework **Gin**, optimizada para baja latencia (<20ms cold start) y alta escalabilidad en **Google Cloud Platform (GCP)** sobre **Cloud Run** y **Cloud SQL PostgreSQL**.

---

## Características Principales

1. **Jerarquía de Comentarios con `ltree`**:
   - Uso de la extensión nativa `ltree` de PostgreSQL indexada con **GiST** para recuperar árboles y subárboles completos de comentarios en una única consulta plana, eliminando consultas recursivas `WITH RECURSIVE`.
   - Borrado suave (*soft-delete*) que preserva la estructura del árbol de comentarios sustituyendo el contenido por `[comentario eliminado]`.
2. **Seguridad y Control RBAC (RFC 9110)**:
   - Segregación estricta entre endpoints de cliente final (`/api/v1/`) y endpoints administrativos/moderación (`/api/v1/admin/`).
   - Roles globales: `USER`, `COMMUNITY_MOD`, `GLOBAL_ADMIN`.
   - Roles locales de comunidad: `OWNER`, `LEAD_MOD`, `MOD`.
   - Restricción de creación de comunidades: Requiere `karma_score >= 100`.
   - Sanitización contra inyecciones XSS y validación de tipos MIME multimedia.
3. **Persistencia Obligatoria en PostgreSQL (Cloud SQL)**:
   - Conexión nativa de producción mediante **Unix Domain Socket** (`/cloudsql/<INSTANCE_CONNECTION_NAME>`) y soporte TCP para desarrollo local.
   - Pool de conexiones calibrado (`MaxOpenConns=25`, `MaxIdleConns=10`, `ConnMaxLifetime=1h`).
   - Cero pérdida de datos ante reinicios o nuevos despliegues de Cloud Run.
4. **Cero Secretos Hardcodeados**:
   - Inyección en runtime desde **Google Secret Manager** (`JWT_SECRET`, `DB_PASSWORD`).
   - Servicio ejecutado bajo Service Account dedicada con principio de mínimo privilegio (`roles/cloudsql.client`, `roles/secretmanager.secretAccessor`).
5. **Algoritmo de Atenuación Temporal (Hot Ranking Decay)**:
   - Ordenamiento dinámico en `/api/v1/recommendations/feed` basado en:
     $$Score_{hot} = \frac{S_{net}}{(T+2)^{1.8}}$$
6. **Patrón Write-Behind para Votación Masiva**:
   - Separación física de tablas `post_votes` y `comment_votes` para evitar *table locks*.
7. **Especificación OpenAPI 3.0**:
   - Documentación interactiva servida en `/openapi.yaml` y detallada en [`openapi.yaml`](./openapi.yaml).

---

## Estructura del Proyecto

```
Forfunable/
├── main.go                     # Punto de entrada, router Gin, health check y graceful shutdown
├── openapi.yaml                # Especificación OpenAPI 3.0 completa
├── Dockerfile                  # Multi-stage build minimalista y seguro (Alpine, non-root UID 10001)
├── .dockerignore               # Filtro de exclusión para compilación Docker limpia
├── .env.example                # Plantilla de variables de entorno documentada
├── TROUBLESHOOTING.md          # Registro continuo de decisiones y solución de problemas
├── docs/                       # Documentación técnica y de infraestructura
│   ├── DEPLOYMENT_GCP.md       # Guía paso a paso de despliegue en GCP (PowerShell)
│   ├── CLOUD_SQL_SETUP.md      # Aprovisionamiento y configuración de Cloud SQL PostgreSQL 15
│   ├── SECURITY_CHECKLIST.md   # Matriz de cumplimiento de seguridad y mínimos privilegios
│   ├── PERSISTENCE_PROOF_GCP.md# Protocolo y evidencia de persistencia ante reinicios
│   └── POSTGRES_AUDIT.md       # Auditoría exhaustiva de métodos PostgresRepository
├── database/
│   ├── schema.sql              # DDL PostgreSQL con ltree, pgcrypto, FKs, CHECKs e índices GiST
│   ├── seeds.sql               # Datos iniciales con contraseñas BCrypt reales (Password123!)
│   └── migrations/             # Migraciones versionadas (V001__schema, V002__seeds)
├── models/
│   ├── models.go               # Entidades de dominio
│   └── dtos.go                 # Data Transfer Objects (DTOs) con validaciones Gin
├── repository/
│   ├── repository.go           # Interfaz unificada de persistencia
│   ├── postgres_repo.go        # Implementación nativa PostgreSQL para Cloud SQL (Unix/TCP)
│   └── memory_repo.go          # Implementación en memoria (exclusiva para unit tests)
├── middleware/
│   ├── auth.go                 # JWT authentication y claims extraction
│   ├── rbac.go                 # Control de acceso basado en roles globales y de comunidad
│   ├── ratelimit.go            # Limitador de tasa (429 Too Many Requests)
│   └── security.go             # Cabeceras de seguridad y sanitización contra XSS
├── handlers/                   # Handlers RESTful para todos los 56 endpoints
├── tests/                      # Suite de pruebas automatizadas unitarias y de integración
│   ├── postgres_integration_test.go # Pruebas directas contra PostgreSQL
│   ├── auth_test.go
│   ├── crud_test.go
│   ├── integration_test.go
│   └── ltree_ranking_test.go
└── bruno/                      # Colección nativa en formato directorio de Bruno
    ├── bruno.json
    ├── environments/
    │   ├── local.bru           # Entorno para ejecución local
    │   └── cloud-run.bru       # Entorno para URL pública de Cloud Run
    └── evaluacion-gcp/         # Suite de pruebas de evaluación para el profesor
        ├── 00-Health/
        ├── 01-Auth/
        ├── 02-Perfil/
        ├── 03-Comunidades/
        ├── 04-Posts/
        ├── 05-Comentarios/
        ├── 06-Votos/
        └── 07-Errores/
```

---

## Ejecución Local con PostgreSQL

La aplicación requiere PostgreSQL activo (localmente o en Cloud SQL):

1. **Aplicar esquema y datos semilla**:
   ```bash
   psql -U postgres -d forfunable_db -f database/schema.sql
   psql -U postgres -d forfunable_db -f database/seeds.sql
   ```

2. **Configurar variables de entorno e iniciar**:
   ```powershell
   $env:DATABASE_URL="postgres://postgres:tu_password@127.0.0.1:5432/forfunable_db?sslmode=disable"
   $env:JWT_SECRET="clave-secreta-para-desarrollo-local-minimo-32-chars"
   $env:PORT="8080"
   go run main.go
   ```

3. **Verificar estado de salud**:
   ```bash
   curl http://localhost:8080/health
   # Respuesta: {"database":"CONNECTED","environment":"development","status":"HEALTHY"}
   ```

---

## Despliegue en Google Cloud Platform (GCP)

Para el despliegue en producción sobre **Cloud Run**, **Cloud SQL** y **Secret Manager**, consulte el manual detallado:

👉 **[Manual de Despliegue Paso a Paso (docs/DEPLOYMENT_GCP.md)](docs/DEPLOYMENT_GCP.md)**

### Resumen del flujo de despliegue:
1. Habilitar APIs de GCP (`run`, `sqladmin`, `secretmanager`, `artifactregistry`, `cloudbuild`).
2. Crear instancia Cloud SQL PostgreSQL 15 y aplicar `database/schema.sql` y `database/seeds.sql`.
3. Almacenar `JWT_SECRET` y `DB_PASSWORD` en **Google Secret Manager**.
4. Crear la Service Account `sa-forfunable-api` con roles `roles/cloudsql.client` y `roles/secretmanager.secretAccessor`.
5. Compilar la imagen con Google Cloud Build: `gcloud builds submit --tag ... .`
6. Desplegar en Cloud Run con `--add-cloudsql-instances` y `--set-secrets`.

---

## Evaluación y Pruebas con Bruno

La carpeta `bruno/evaluacion-gcp/` está configurada específicamente para los criterios de evaluación del profesor:

1. Abra **Bruno** y seleccione la carpeta `Forfunable/bruno`.
2. Seleccione el entorno **`cloud-run`** (ajuste la variable `baseUrlRoot` con la URL de su servicio Cloud Run).
3. Ejecute la suite de peticiones en orden:
   - `00-Health/HealthCheck`: Valida status 200, `HEALTHY` y `CONNECTED`.
   - `01-Auth/LoginUser` y `LoginAdmin`: Obtención de JWT tokens y claims reales.
   - `01-Auth/RegisterUser`: Alta de usuario para prueba de persistencia.
   - `02-Perfil`: Consulta (`/me`) y actualización de biografía.
   - `03-Comunidades`: Creación y consulta de comunidades.
   - `04-Posts`: Creación y consulta de posts con datos reales.
   - `05-Comentarios`: Inserción y lectura de comentarios jerárquicos `ltree`.
   - `06-Votos`: Votación e incremento dinámico de karma.
   - `07-Errores`: Casos de error controlados en JSON (400, 401, 403, 404, 409).

### Usuarios Semilla Precargados (Contraseña: `Password123!`):
| Usuario | Rol Global | Karma | Correo | Propósito |
| :--- | :--- | :--- | :--- | :--- |
| `admin_master` | `GLOBAL_ADMIN` | 9999 | `admin@forfunable.com` | Acceso a `/api/v1/admin/*` |
| `mod_diego` | `COMMUNITY_MOD` | 500 | `diego@forfunable.com` | Moderación local en comunidad `golang` |
| `kiba_dev` | `USER` | 250 | `kiba@forfunable.com` | Creación de comunidades (Karma >= 100) |
| `newbie_user` | `USER` | 10 | `newbie@forfunable.com` | Usuario novato (Karma < 100) |

---

## Demostración de Persistencia

Para acreditar ante el profesor que los datos no se pierden al reiniciar o actualizar el contenedor, siga el protocolo documentado en:

👉 **[Protocolo de Persistencia en Cloud SQL (docs/PERSISTENCE_PROOF_GCP.md)](docs/PERSISTENCE_PROOF_GCP.md)**

---

## Pruebas Automatizadas

```powershell
# Ejecutar todas las pruebas unitarias y de integración
go test -v ./tests/...

# Ejecutar pruebas contra PostgreSQL activo
$env:TEST_DATABASE_URL="postgres://postgres:password@127.0.0.1:5432/forfunable_db?sslmode=disable"
go test -v -run TestPostgresIntegration ./tests/...
```
