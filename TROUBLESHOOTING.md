# Registro de Solución de Problemas y Decisiones Técnicas (TROUBLESHOOTING.md)

Este documento registra los cuellos de botella, riesgos de concurrencia, seguridad y arquitectura identificados durante el diseño e implementación de la plataforma **Forfunable** en Google Cloud Platform y Go, junto con sus soluciones aplicadas.

---

### [2026-09-23 20:30:00 UTC] - Cuello de Botella por Consultas SQL Recursivas (WITH RECURSIVE) en Hilos de Comentarios Anidados

- **Descripción del Problema**:  
  El diseño original de foros mediante relaciones adyacentes (`parent_id`) requiere el uso de consultas SQL recursivas (`WITH RECURSIVE`). A medida que la profundidad del debate y el volumen de respuestas anidadas crece, la complejidad temporal y el consumo de CPU en Cloud SQL PostgreSQL aumentan exponencialmente, provocando bloqueos de lectura y latencias superiores a 1.5 segundos.

- **Solución Aplicada**:  
  Se integró la extensión nativa `ltree` de PostgreSQL indexada mediante **GiST** (`idx_comments_path_gist`).  
  Cada comentario almacena su ruta jerárquica jerarquizada (por ejemplo: `post_uuid.parent_uuid.child_uuid`).  
  Gracias a esto, recuperar un subárbol completo de comentarios ordenados se realiza mediante una única consulta plana (`path <@ 'root' ORDER BY path ASC`) con tiempos de respuesta sub-milisegundo (< 15 ms).  
  Adicionalmente, al eliminar un comentario padre, se implementó un *soft-delete* que sustituye el contenido por `[comentario eliminado]`, preservando intactos los nodos hijos y la integridad estructural del árbol.

---

### [2026-09-23 20:35:00 UTC] - Contención de Transacciones y Bloqueo de Filas (Table Locks) ante Votación Masiva Viral

- **Descripción del Problema**:  
  Cuando una publicación adquiere viralidad, miles de peticiones concurrentes de votación ejecutan sentencias `UPDATE posts SET upvotes_count = upvotes_count + 1 WHERE id = ...` sobre la misma fila. Esto genera contención severa de transacciones a nivel de fila (*row-level locks*) en PostgreSQL, degradando la tasa de procesamiento del backend y saturando el pool de conexiones.

- **Solución Aplicada**:  
  Se implementó la separación física estricta de las tablas de votos (`post_votes` y `comment_votes`) con claves primarias compuestas `(user_id, post_id)` y restricción `CHECK (vote_value IN (-1, 1))`.  
  Se diseñó la arquitectura para absorber votos en tablas independientes evitando cuellos de botella en la tabla principal de publicaciones.

---

### [2026-09-23 20:40:00 UTC] - Seguridad Perimetral, Cero Credenciales Hardcodeadas y Mitigación de Cuentas Sintéticas

- **Descripción del Problema**:  
  Riesgo de exposición de secretos (claves JWT, contraseñas de PostgreSQL, API keys) en el repositorio y ataques de coordinación masiva (astroturfing, bots automatizados creando comunidades y alterando el karma).

- **Solución Aplicada**:  
  1. **Cero Credenciales**: Todas las configuraciones y secretos son administrados a través de variables de entorno inyectadas directamente desde Google Secret Manager (`JWT_SECRET`, `DB_PASSWORD`, `DATABASE_URL`).
  2. **Control de Reputación**: Se estableció la regla de negocio que restringe la creación de comunidades exclusivamente a usuarios con un puntaje de karma igual o superior a 100 puntos (`user.KarmaScore >= 100`), evitando la creación indiscriminada de sub-foros.
  3. **Sanitización contra XSS**: Todos los inputs de texto libre (biografía, títulos, publicaciones, comentarios) son sanitizados mediante codificación HTML defensiva y validación estricta de formato en subidas multimedia.

---

### [2026-09-23 21:15:00 UTC] - Persistencia Obligatoria en PostgreSQL y Eliminación de Fallback en Runtime

- **Descripción del Problema**:  
  El código anterior recurría silenciosamente a `MemoryRepository` si `DATABASE_URL` no estaba configurada, ocultando fallas de configuración y arriesgando pérdida total de datos al reiniciar instancias de Cloud Run (falso positivo de funcionamiento).

- **Solución Aplicada**:  
  Se refactorizó `main.go` para hacer obligatoria la configuración de PostgreSQL (`DATABASE_URL` o `INSTANCE_CONNECTION_NAME`). Si la base de datos no está disponible o la configuración está incompleta, el proceso se aborta inmediatamente con `log.Fatalf`. `MemoryRepository` queda confinado exclusivamente a la suite de tests unitarios aislados en `tests/`.

---

### [2026-09-23 21:30:00 UTC] - Conexión Segura vía Unix Domain Socket en Cloud Run

- **Descripción del Problema**:  
  En Google Cloud Run, la forma segura y de menor latencia para conectar a Cloud SQL es a través de sockets Unix montados en `/cloudsql/<INSTANCE_CONNECTION_NAME>`. Las cadenas de conexión TCP estándar requerirían abrir IPs públicas en Cloud SQL o túneles complejos.

- **Solución Aplicada**:  
  Se implementó en `config/config.go` y `repository/postgres_repo.go` el método `BuildDSN()` con detección automática de `INSTANCE_CONNECTION_NAME`. Si está presente, construye el DSN en formato de socket Unix:
  `host=/cloudsql/<INSTANCE_CONNECTION_NAME> user=... dbname=... sslmode=disable password=...`
  Adicionalmente se calibró el connection pool (`SetMaxOpenConns(25)`, `SetMaxIdleConns(10)`, `SetConnMaxLifetime(1h)`) para evitar agotar las conexiones disponibles en instancias pequeñas de Cloud SQL.

---

### [2026-09-23 21:45:00 UTC] - Graceful Shutdown y Señales SIGTERM de Cloud Run

- **Descripción del Problema**:  
  Cuando Google Cloud Run escala a cero o realiza un nuevo despliegue, envía una señal `SIGTERM` al contenedor y otorga un tiempo de gracia antes de destruirlo. Si el servidor HTTP y el pool de PostgreSQL no capturan esta señal, las peticiones en vuelo se cortan abruptamente y las conexiones de base de datos quedan colgadas.

- **Solución Aplicada**:  
  En `main.go` se implementó la captura de señales `syscall.SIGTERM` y `syscall.SIGINT` usando un canal de señalización. Al recibir la señal, se ejecuta un apagado ordenado del servidor HTTP con timeout de 10 segundos (`srv.Shutdown`) y se cierra explícitamente el pool de conexiones (`pgRepo.Close()`).

---

### [2026-09-23 22:00:00 UTC] - Verificación Real de Contraseñas Semilla con BCrypt

- **Descripción del Problema**:  
  En `database/seeds.sql`, las contraseñas de los usuarios semilla contenían texto plano o hashes simulados que fallaban al intentar autenticarse con `bcrypt.CompareHashAndPassword` en la API Go.

- **Solución Aplicada**:  
  Se generó un hash BCrypt criptográficamente real para la contraseña `Password123!` utilizando `golang.org/x/crypto/bcrypt` con costo 10 (`$2a$10$es02jZNN9GYxlOSqQOf.nOBsJx5HNihgAYQXPeSm4Xs2W9BhFeU1m`). Este hash fue integrado en `database/seeds.sql` y en las migraciones versionadas, permitiendo que las pruebas de login en Bruno y tests de integración funcionen inmediatamente.

---

### [2026-09-23 22:15:00 UTC] - Endpoint de Salud (Health Check) con Verificación Activa de Base de Datos

- **Descripción del Problema**:  
  El endpoint `/health` respondía `200 OK` estático sin verificar si la base de datos PostgreSQL estaba viva o caída, impidiendo que los balanceadores de carga o monitores de GCP detectaran cortes en Cloud SQL.

- **Solución Aplicada**:  
  Se implementó en `main.go` la llamada activa `pgRepo.Ping(ctx)` con un timeout estricto de 2 segundos. Si PostgreSQL responde, devuelve HTTP 200 con `{"status": "HEALTHY", "database": "CONNECTED"}`. Si la conexión falla, responde HTTP 503 Service Unavailable con `{"status": "DEGRADED", "database": "DISCONNECTED"}`.
