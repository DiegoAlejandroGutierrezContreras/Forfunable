# Protocolo y Evidencia de Persistencia en Google Cloud Platform
## Demostración de Persistencia: Cloud Run + Cloud SQL PostgreSQL

Este documento contiene la metodología formal para demostrar ante el evaluador/profesor que **Forfunable** no depende de almacenamiento en memoria volátil y que la totalidad de los datos persiste de manera íntegra en Google Cloud SQL, incluso tras el reinicio forzado, reemplazo de contenedor o nuevo despliegue de la API en Google Cloud Run.

---

## 1. Fundamento de la Arquitectura de Persistencia

1. **Contenedores Stateless en Cloud Run**:
   - Cada contenedor de Cloud Run es efímero y carece de estado local. Si la API almacenara datos en memoria (`MemoryRepository`), cualquier nuevo despliegue o escalado a cero (scale-to-zero) destruiría los registros.
2. **PostgreSQL Administrado en Cloud SQL**:
   - Los datos se almacenan en discos de estado sólido (SSD) redundantes y gestionados por Google Cloud SQL.
   - Las conexiones viajan a través de Unix Domain Sockets autenticados mediante la Service Account con rol `roles/cloudsql.client`.

---

## 2. Protocolo de Prueba de Persistencia Paso a Paso

### Paso 1: Inserción de Datos a través de la API Pública

Utilizando la colección de Bruno (`bruno/evaluacion-gcp`) o `curl` contra la URL pública de Cloud Run:

1. **Iniciar sesión como usuario de prueba**:
   ```bash
   POST https://<CLOUD_RUN_URL>/api/v1/auth/login
   { "username": "kiba_dev", "password": "Password123!" }
   ```
2. **Crear una nueva comunidad persistente**:
   ```bash
   POST https://<CLOUD_RUN_URL>/api/v1/communities
   Authorization: Bearer <TOKEN>
   {
     "name": "comunidad-persistencia",
     "description": "Comunidad para comprobar persistencia en Cloud SQL"
   }
   ```
3. **Crear una publicación**:
   ```bash
   POST https://<CLOUD_RUN_URL>/api/v1/posts
   Authorization: Bearer <TOKEN>
   {
     "community_id": "<COMMUNITY_ID>",
     "title": "Post de Verificación de Persistencia",
     "content_type": "TEXT",
     "body_text": "Este registro fue creado antes del reinicio del contenedor."
   }
   ```
4. **Votar por la publicación**:
   ```bash
   POST https://<CLOUD_RUN_URL>/api/v1/votes/posts/<POST_ID>
   Authorization: Bearer <TOKEN>
   { "vote_value": 1 }
   ```

---

### Paso 2: Destrucción y Reinicio de Instancias en Cloud Run

Para demostrar inequívocamente que los datos no residen en la memoria del contenedor, se fuerza el reemplazo de todas las instancias activas de Cloud Run mediante el despliegue de una nueva revisión:

```powershell
# Forzar una nueva revisión en Cloud Run actualizando una variable no destructiva
gcloud run services update forfunable-api `
    --platform=managed `
    --region=us-central1 `
    --update-env-vars="RESTART_TRIGGER=$(Get-Date -Format 'yyyyMMdd-HHmmss')"
```

> **¿Qué ocurre internamente?**
> Google Cloud Run crea una nueva revisión inmutable, envía una señal `SIGTERM` a los contenedores anteriores (provocando el *graceful shutdown* implementado en `main.go`) y destruye completamente la memoria RAM de las instancias previas.

---

### Paso 3: Verificación Inmediata de los Datos Persistidos

Una vez finalizado el despliegue de la nueva revisión:

1. **Consultar el Health Check**:
   ```bash
   GET https://<CLOUD_RUN_URL>/health
   ```
   *Respuesta esperada:* `{"database": "CONNECTED", "environment": "production", "status": "HEALTHY"}`.
2. **Consultar la publicación creada en el Paso 1**:
   ```bash
   GET https://<CLOUD_RUN_URL>/api/v1/posts/<POST_ID>
   ```
   *Resultado comprobable:*
   - El título coincide exactamente con `"Post de Verificación de Persistencia"`.
   - El contador `upvotes_count` mantiene el valor `1`.
   - La comunidad `"comunidad-persistencia"` sigue registrada y accesible.

---

## 3. Verificación Directa en Cloud SQL (Auditoría SQL)

Para presentar evidencia técnica irrefutable desde el lado del motor de base de datos:

1. Conectar mediante Cloud SQL Auth Proxy o `gcloud sql connect`:
   ```powershell
   gcloud sql connect forfunable-sql --user=forfunable_user --database=forfunable_db
   ```
2. Ejecutar la consulta de auditoría:
   ```sql
   SELECT id, title, upvotes_count, created_at
   FROM posts
   WHERE title = 'Post de Verificación de Persistencia';
   ```
3. La consulta retorna la fila con su clave primaria UUID y timestamp original, demostrando que la persistencia en disco SSD de PostgreSQL se cumplió cabalmente.
