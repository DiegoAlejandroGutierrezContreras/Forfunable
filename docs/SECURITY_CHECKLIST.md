# Lista de Verificación de Seguridad (Security Checklist) - Forfunable API

Este documento certifica las medidas de seguridad implementadas en la arquitectura de **Forfunable** para su despliegue en Google Cloud Platform (Cloud Run, Cloud SQL y Secret Manager).

---

## 1. Gestión de Identidades y Permisos Mínimos (IAM)

- [x] **Cuenta de Servicio Dedicada**: La API no utiliza la cuenta predeterminada de Compute Engine. Se utiliza `sa-forfunable-api@<PROJECT_ID>.iam.gserviceaccount.com`.
- [x] **Roles Estrictamente Limitados**:
  - `roles/cloudsql.client`: Permite autorizar y conectar con la instancia de Cloud SQL mediante Unix Domain Sockets.
  - `roles/secretmanager.secretAccessor`: Permite leer únicamente los secretos autorizados en Secret Manager.
- [x] **Sin Permisos de Administrador**: La Service Account carece de permisos de escritura/eliminación sobre recursos de infraestructura (`roles/editor` u `roles/owner` están expresamente prohibidos).

---

## 2. Gestión Segura de Secretos y Configuración

- [x] **Cero Secretos Hardcodeados**: No existen claves JWT, contraseñas de base de datos ni tokens en el repositorio Git ni en imágenes de contenedor.
- [x] **Google Secret Manager**:
  - `JWT_SECRET`: Llave criptográfica aleatoria de 32+ bytes.
  - `DB_PASSWORD`: Contraseña del usuario de Cloud SQL.
- [x] **Inyección Segura en Cloud Run**: Los secretos se inyectan en tiempo de ejecución mediante la directiva `--set-secrets` de Cloud Run, sin exponerse en registros de compilación ni variables de entorno estáticas en texto plano.

---

## 3. Seguridad en la Capa de Base de Datos y Red

- [x] **Conexión mediante Unix Domain Socket**:
  - La comunicación entre Cloud Run y Cloud SQL viaja encapsulada a través del túnel local `/cloudsql/<INSTANCE_CONNECTION_NAME>`, sin exponer el puerto 5432 de la base de datos a Internet público.
- [x] **Protección contra Inyección SQL (SQLi)**:
  - El 100% de las sentencias en `repository/postgres_repo.go` utilizan consultas parametrizadas nativas (`$1, $2, ...`).
  - No existe concatenación de cadenas directas para valores de entrada del usuario en consultas SQL.
- [x] **Validación de Integridad en Esquema**:
  - Llaves foráneas con borrado en cascada controlado (`ON DELETE CASCADE` / `ON DELETE RESTRICT`).
  - Restricciones `CHECK` para puntuaciones de karma no negativas, valores de voto restringidos a (-1, 1), y prevención de auto-mensajes/auto-bloqueos.

---

## 4. Criptografía y Autenticación de Usuarios

- [x] **Hashing de Contraseñas Robusto**:
  - Se utiliza `golang.org/x/crypto/bcrypt` con costo 10 (`bcrypt.DefaultCost`).
  - Las contraseñas en texto plano se descartan inmediatamente tras la verificación.
- [x] **Firma de Tokens JWT**:
  - Tokens firmados con algoritmo HMAC-SHA256 (`HS256`).
  - Validación estricta de tiempo de expiración (`exp`) y claims obligatorios (`user_id`, `role`).

---

## 5. Endurecimiento del Contenedor Docker

- [x] **Multi-Stage Build**: La imagen final solo contiene el binario compilado estáticamente y certificados mínimos de CA, reduciendo la superficie de ataque a menos de 25 MB.
- [x] **Ejecución como Usuario No Privilegiado**:
  - El contenedor corre con el usuario `appuser` (UID 10001, no-root).
- [x] **Sin herramientas innecesarias**: La imagen de producción carece de compiladores, shells administrativas innecesarias o utilidades de red de depuración.

---

## 6. Seguridad en la Capa HTTP (Middleware)

- [x] **Cabeceras de Seguridad (Security Headers)**:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- [x] **Limitación de Tasa (Rate Limiting)**:
  - Protección perimetral en memoria contra abusos y ataques de fuerza bruta (300 solicitudes/minuto por IP).
- [x] **CORS Restringido**: Cabeceras de control de acceso configuradas para evitar orígenes no autorizados en navegadores.
