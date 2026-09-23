# Manual de Despliegue en Google Cloud Platform (GCP)
## Forfunable API: Cloud Run + Cloud SQL PostgreSQL + Secret Manager

Esta guía contiene la secuencia completa de comandos en **PowerShell** para desplegar Forfunable en Google Cloud Platform de principio a fin, asegurando persistencia de datos, seguridad de secretos y permisos mínimos.

---

## Estrategia de Conexión a Base de Datos (Código vs Entorno)

La aplicación implementa dos modos de conexión mutuamente consistentes mediante `BuildDSN()` en `config/config.go`:

| Entorno | Variables Requeridas | Formato DSN Resultante | ¿Requiere `DATABASE_URL`? |
|---|---|---|---|
| **Google Cloud Run (Producción)** | `INSTANCE_CONNECTION_NAME`<br>`DB_NAME`<br>`DB_USER`<br>`DB_PASSWORD` (Secret Manager) | `host=/cloudsql/<INSTANCE_CONNECTION_NAME> dbname=<DB_NAME> user=<DB_USER> password=<DB_PASSWORD> sslmode=disable` | **NO**. Cloud Run utiliza el socket Unix montado por `--add-cloudsql-instances`. No debe configurarse `DATABASE_URL`. |
| **Desarrollo Local / TCP** | `DATABASE_URL` | `postgres://<user>:<pass>@127.0.0.1:5432/<db>?sslmode=disable` | **SÍ**. Para conexiones TCP fuera del entorno de Google Cloud. |

---

## 0. Prerrequisitos

1. **Google Cloud SDK (`gcloud`)** instalado y autenticado:
   ```powershell
   gcloud auth login
   gcloud auth application-default login
   ```
2. Tener un proyecto en GCP con facturación activa.
3. Herramienta **Docker** instalada localmente (opcional si se utiliza Cloud Build).

---

## 1. Definición de Variables de Despliegue (PowerShell)

Copie y pegue este bloque en su terminal de PowerShell, ajustando el valor de `$PROJECT_ID`:

```powershell
# ==========================================
# VARIABLES DEL PROYECTO (AJUSTAR ESTA LÍNEA)
# ==========================================
$PROJECT_ID       = "tu-id-de-proyecto-gcp"  # <- Reemplazar por su Project ID real
$REGION           = "us-central1"
$SERVICE_NAME     = "forfunable-api"
$INSTANCE_NAME    = "forfunable-sql"
$DB_NAME          = "forfunable_db"
$DB_USER          = "forfunable_user"
$SA_NAME          = "sa-forfunable-api"
$REPO_NAME        = "forfunable-repo"
$IMAGE_TAG        = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$SERVICE_NAME`:v1"

# Generar contraseñas criptográficas seguras automáticamente
$DB_PASSWORD      = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object {[char]$_})
$JWT_SECRET       = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})

# Configurar el proyecto activo
gcloud config set project $PROJECT_ID
```

---

## 2. Habilitación de APIs Requeridas

```powershell
gcloud services enable `
    run.googleapis.com `
    sqladmin.googleapis.com `
    secretmanager.googleapis.com `
    artifactregistry.googleapis.com `
    cloudbuild.googleapis.com `
    iam.googleapis.com `
    --project $PROJECT_ID
```

---

## 3. Creación de la Instancia de Cloud SQL PostgreSQL

```powershell
# 1. Crear la instancia de PostgreSQL 15
Write-Host "Creando instancia Cloud SQL..." -ForegroundColor Cyan
gcloud sql instances create $INSTANCE_NAME `
    --project=$PROJECT_ID `
    --database-version=POSTGRES_15 `
    --tier=db-f1-micro `
    --region=$REGION `
    --storage-type=SSD `
    --storage-size=10GB `
    --storage-auto-increase `
    --root-password=$DB_PASSWORD

# 2. Crear la base de datos de la aplicación
Write-Host "Creando base de datos..." -ForegroundColor Cyan
gcloud sql databases create $DB_NAME `
    --instance=$INSTANCE_NAME `
    --project=$PROJECT_ID

# 3. Crear el usuario para la API de Go
Write-Host "Creando usuario de base de datos..." -ForegroundColor Cyan
gcloud sql users create $DB_USER `
    --instance=$INSTANCE_NAME `
    --project=$PROJECT_ID `
    --password=$DB_PASSWORD

# 4. Obtener el nombre de conexión único (Instance Connection Name)
$INSTANCE_CONNECTION_NAME = gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID --format="value(connectionName)"
Write-Host "Nombre de conexión Cloud SQL: $INSTANCE_CONNECTION_NAME" -ForegroundColor Green
```

---

## 4. Inicialización del Esquema y Semillas en Cloud SQL

Para aplicar `database/schema.sql` y `database/seeds.sql` se recomienda el uso del **Cloud SQL Auth Proxy**:

```powershell
# 1. Descargar Cloud SQL Proxy (si no lo tiene instalado):
# Invoke-WebRequest -Uri "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.x64.exe" -OutFile "cloud-sql-proxy.exe"

# 2. Iniciar el proxy en una terminal secundaria:
# .\cloud-sql-proxy.exe "$INSTANCE_CONNECTION_NAME" --port 5432

# 3. En la terminal principal, ejecutar los scripts SQL mediante psql (conexión TCP local a través del proxy):
# psql "postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?sslmode=disable" -f database/schema.sql
# psql "postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?sslmode=disable" -f database/seeds.sql
```

> **Alternativa mediante Google Cloud Storage:**
> Si prefiere no usar proxy local, suba los archivos a un bucket privado de Cloud Storage y use `gcloud sql import sql`:
> ```powershell
> gcloud storage buckets create gs://$PROJECT_ID-sql-init --location=$REGION
> gcloud storage cp database/schema.sql gs://$PROJECT_ID-sql-init/schema.sql
> gcloud storage cp database/seeds.sql gs://$PROJECT_ID-sql-init/seeds.sql
>
> # Dar permisos al Service Account de Cloud SQL sobre el bucket
> $SQL_SA = gcloud sql instances describe $INSTANCE_NAME --format="value(serviceAccountEmailAddress)"
> gcloud storage buckets add-iam-policy-binding gs://$PROJECT_ID-sql-init --member="serviceAccount:$SQL_SA" --role="roles/storage.objectViewer"
>
> # Importar esquema y semillas
> gcloud sql import sql $INSTANCE_NAME gs://$PROJECT_ID-sql-init/schema.sql --database=$DB_NAME --quiet
> gcloud sql import sql $INSTANCE_NAME gs://$PROJECT_ID-sql-init/seeds.sql --database=$DB_NAME --quiet
> ```

---

## 5. Configuración de Secretos en Google Secret Manager

```powershell
# 1. Crear y poblar el secreto para JWT
Write-Host "Guardando JWT_SECRET en Secret Manager..." -ForegroundColor Cyan
$JWT_SECRET | gcloud secrets create forfunable-jwt-secret --data-file=- --project=$PROJECT_ID

# 2. Crear y poblar el secreto para la contraseña de BD
Write-Host "Guardando DB_PASSWORD en Secret Manager..." -ForegroundColor Cyan
$DB_PASSWORD | gcloud secrets create forfunable-db-password --data-file=- --project=$PROJECT_ID
```

---

## 6. Creación de la Service Account con Principio de Mínimo Privilegio

```powershell
$SA_EMAIL = "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# 1. Crear la cuenta de servicio
gcloud iam service-accounts create $SA_NAME `
    --display-name="Service Account para Forfunable API Cloud Run" `
    --project=$PROJECT_ID

# 2. Otorgar rol para conectarse a Cloud SQL
gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:$SA_EMAIL" `
    --role="roles/cloudsql.client"

# 3. Otorgar rol para leer secretos de Secret Manager
gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:$SA_EMAIL" `
    --role="roles/secretmanager.secretAccessor"
```

---

## 7. Compilación y Publicación del Contenedor

### Opción A: Usando Google Cloud Build (Recomendada - no requiere Docker local)

```powershell
# 1. Crear el repositorio en Artifact Registry
gcloud artifacts repositories create $REPO_NAME `
    --repository-format=docker `
    --location=$REGION `
    --description="Repositorio de Docker para Forfunable" `
    --project=$PROJECT_ID

# 2. Compilar la imagen remotamente en GCP
gcloud builds submit --tag $IMAGE_TAG .
```

---

## 8. Despliegue del Servicio en Cloud Run

En este paso se conectan las 4 variables de base de datos (`INSTANCE_CONNECTION_NAME`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` como secreto). **No se pasa `DATABASE_URL`**:

```powershell
Write-Host "Desplegando en Cloud Run..." -ForegroundColor Cyan

gcloud run deploy $SERVICE_NAME `
    --image=$IMAGE_TAG `
    --platform=managed `
    --region=$REGION `
    --project=$PROJECT_ID `
    --service-account=$SA_EMAIL `
    --allow-unauthenticated `
    --add-cloudsql-instances=$INSTANCE_CONNECTION_NAME `
    --set-env-vars="INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME,DB_NAME=$DB_NAME,DB_USER=$DB_USER,ENVIRONMENT=production,GIN_MODE=release,PORT=8080" `
    --set-secrets="JWT_SECRET=forfunable-jwt-secret:latest,DB_PASSWORD=forfunable-db-password:latest" `
    --cpu=1 `
    --memory=512Mi `
    --min-instances=0 `
    --max-instances=5 `
    --timeout=60s
```

---

## 9. Verificación de Despliegue y URL Pública

```powershell
# Obtener la URL asignada por Cloud Run
$SERVICE_URL = gcloud run services describe $SERVICE_NAME --platform=managed --region=$REGION --project=$PROJECT_ID --format="value(status.url)"
Write-Host "URL Pública de Forfunable API: $SERVICE_URL" -ForegroundColor Green

# Probar el endpoint de Health Check
Invoke-RestMethod -Uri "$SERVICE_URL/health" -Method Get | ConvertTo-Json
```

Respuesta esperada:
```json
{
  "database": "CONNECTED",
  "environment": "production",
  "status": "HEALTHY"
}
```
Si la base de datos responde `CONNECTED`, el despliegue es 100% exitoso y la API está lista para las pruebas con Bruno.
