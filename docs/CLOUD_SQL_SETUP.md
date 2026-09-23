# Configuración de Google Cloud SQL (PostgreSQL 15+)

Esta guía detalla los pasos para aprovisionar y configurar una instancia de PostgreSQL en Google Cloud SQL con soporte nativo para extensiones `ltree` y `pgcrypto`, optimizada para interactuar con Cloud Run mediante Unix Domain Sockets.

---

## 1. Parámetros de la Instancia

| Parámetro | Valor Recomendado | Explicación |
|---|---|---|
| **Motor** | `POSTGRES_15` o `POSTGRES_16` | Compatibilidad total con extensiones y tipos enum. |
| **Tier / CPU / RAM** | `db-f1-micro` o `db-g1-small` (dev/evaluación) / `db-custom-2-7680` (prod) | Escalable según carga. |
| **Almacenamiento** | SSD, mínimo 10 GB con *Storage Auto-increase* habilitado | Rendimiento I/O consistente. |
| **IP Pública / Privada** | IP Pública sin redes autorizadas abiertas (acceso mediante Cloud SQL Auth Proxy o Cloud Run Unix Sockets) | Seguridad por defecto. |
| **Extensiones Requeridas** | `ltree`, `pgcrypto` | Árboles jerárquicos de comentarios y generación de UUIDs/hashing. |

---

## 2. Creación de la Instancia con `gcloud`

Ejecute los siguientes comandos en PowerShell asegurándose de haber configurado sus variables de proyecto:

```powershell
$PROJECT_ID = "tu-proyecto-id"
$REGION = "us-central1"
$INSTANCE_NAME = "forfunable-sql"
$DB_NAME = "forfunable_db"
$DB_USER = "forfunable_user"
# Generar password segura aleatoria
$DB_PASSWORD = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object {[char]$_})

# 1. Habilitar el servicio de Cloud SQL
gcloud services enable sqladmin.googleapis.com --project $PROJECT_ID

# 2. Crear la instancia de Cloud SQL PostgreSQL
gcloud sql instances create $INSTANCE_NAME `
    --project=$PROJECT_ID `
    --database-version=POSTGRES_15 `
    --tier=db-f1-micro `
    --region=$REGION `
    --storage-type=SSD `
    --storage-size=10GB `
    --storage-auto-increase `
    --root-password=$DB_PASSWORD

# 3. Crear la base de datos
gcloud sql databases create $DB_NAME `
    --instance=$INSTANCE_NAME `
    --project=$PROJECT_ID

# 4. Crear el usuario de aplicación
gcloud sql users create $DB_USER `
    --instance=$INSTANCE_NAME `
    --project=$PROJECT_ID `
    --password=$DB_PASSWORD
```

---

## 3. Aplicación del Esquema y Semillas

### Método Recomendado: Conexión mediante Cloud SQL Auth Proxy

1. Descargue el Cloud SQL Auth Proxy desde Google Cloud.
2. Inicie el proxy localmente:
   ```powershell
   cloud-sql-proxy "$PROJECT_ID`:$REGION`:$INSTANCE_NAME" --port 5432
   ```
3. Conéctese mediante `psql` o cualquier cliente SQL (como DBeaver o pgAdmin) y ejecute los scripts:
   ```powershell
   # Aplicar extensiones y esquema inicial
   psql "postgres://$DB_USER`:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME?sslmode=disable" -f database/schema.sql

   # Aplicar semillas de prueba con credenciales bcrypt reales
   psql "postgres://$DB_USER`:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME?sslmode=disable" -f database/seeds.sql
   ```

### Método Alternativo: Importación vía Google Cloud Storage
Si no dispone de cliente `psql` local:
1. Suba `schema.sql` y `seeds.sql` a un bucket de GCS:
   ```powershell
   gcloud storage cp database/schema.sql gs://$PROJECT_ID-sql-init/schema.sql
   gcloud storage cp database/seeds.sql gs://$PROJECT_ID-sql-init/seeds.sql
   ```
2. Ejecute la importación a la instancia:
   ```powershell
   gcloud sql import sql $INSTANCE_NAME gs://$PROJECT_ID-sql-init/schema.sql --database=$DB_NAME --project=$PROJECT_ID
   gcloud sql import sql $INSTANCE_NAME gs://$PROJECT_ID-sql-init/seeds.sql --database=$DB_NAME --project=$PROJECT_ID
   ```

---

## 4. Obtención del Nombre de Conexión (Instance Connection Name)

El nombre de conexión es el identificador requerido por Cloud Run para montar el Unix Socket:

```powershell
gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID --format="value(connectionName)"
# Salida esperada: proyecto-id:region:forfunable-sql
```

Este valor se configura en Cloud Run como `INSTANCE_CONNECTION_NAME`.
