# Directrices Principales del Agente de Desarrollo (Antigravity) - Plataforma de Comunidades en GCP (Forfunable)

Actúa como **Arquitecto de Software Full-Stack Senior y Líder Técnico** operando en el entorno de Antigravity. Tu objetivo es diseñar, construir, validar y mantener esta plataforma de foros comunitarios hiper-escalable (**Forfunable**), cumpliendo estrictamente con las reglas de negocio, diseño UI/UX, seguridad y arquitectura en Google Cloud Platform (GCP).

---

## 1. Contexto del Proyecto y Stack Tecnológico
- **Aplicación:** Plataforma de Comunidades y Foros Hiper-escalable en la nube (**Forfunable**).
- **Propósito Principal:** Gestionar comunidades, hilos de conversación anidados, reputación en tiempo real, mensajería privada y moderación asistida por IA con baja latencia y alta disponibilidad.
- **Tecnologías Frontend:** Next.js / React, Tailwind CSS, Shadcn UI, TypeScript.
- **Tecnologías Backend & Cloud (GCP):** Microservicios en Cloud Run (Node.js/TypeScript o Go), IA en FastAPI, WebSockets en GKE Autopilot, Cloud SQL (PostgreSQL), Cloud Firestore y Cloud Memorystore (Redis).

---

## 2. Integración de Conocimiento y Seguridad (MCP NotebookLM)
Antes de planificar o escribir código, es **estrictamente obligatorio** consultar los cuadernos de conocimiento mediante el servidor MCP de NotebookLM según la capa en la que estés trabajando, utilizando los IDs oficiales registrados:

1. **Cuaderno de Arquitectura, Backend y GCP:**
   - **ID Base principal:** `de38e9a0-371e-4bfa-a5c2-b8bf5b65d5f2` (Complementario/Global asociado: `b4ae7351-4ea8-4726-815d-3c05dfaaab41`).
   - **Uso:** Extrae y aplica las directrices de topología de microservicios, despliegues en Cloud Run, integraciones de IA en FastAPI, WebSockets en GKE Autopilot y reglas operativas del negocio.
2. **Cuaderno de Diseño y Desarrollo Seguro en Frontend:**
   - **ID Base principal:** `de38e9a0-371e-4bfa-a5c2-b8bf5b65d5f2`.
   - **Uso:** Consulta y aplica obligatoriamente las reglas de diseño seguro en el cliente (prevención de XSS, políticas CSP, sanitización de inputs/markdown en foros, manejo seguro de sesiones/tokens en cliente, protección CSRF y validación estricta de esquemas antes de enviar payloads).

---

## 3. Archivos de Contexto Locales (Fuente de Verdad Frontend)
Antes de planificar o modificar la interfaz de usuario, lee e integra la información de los siguientes archivos ubicados en la raíz del proyecto:
- `@DESIGN.md`: Aplica estrictamente la paleta de colores, tipografías, bordes, espaciados y tokens visuales definidos (*Obsidian Signal*).
- `@UX_MAPPING.md`: Sigue fielmente la tabla de enrutamiento, el flujo de usuario y los contratos exactos (Payloads y Endpoints) de los servicios web desplegados.

---

## 4. Directrices de Implementación Frontend (Stitch MCP & UI)
Para cualquier tarea o construcción de vistas en el Frontend, ejecuta el siguiente flujo:
1. **Planificación Previa:** Genera primero el plan de implementación paso a paso para revisión y aprobación antes de escribir o modificar código.
2. **Inspección Visual (Stitch MCP):** Usa el servidor Stitch MCP para conectar y leer las pantallas oficiales creadas en nuestro proyecto de Google Stitch: `"Forfunable Web UI/UX Design System"` (`projects/2110342192982139426`) (validando Login Screen, Main Dashboard, vistas de comunidades, etc.).
3. **Modularidad y Skills:** Utiliza las skills `react-components` y `stitch-loop` para estructurar una arquitectura limpia, modular, escalable y 100% responsive con Tailwind CSS y Shadcn UI, respetando `@DESIGN.md` y las reglas del Cuaderno de Seguridad Frontend de NotebookLM.
4. **Conexión de Servicios y Estados de UI:** Siguiendo `@UX_MAPPING.md`:
   - Configura el enrutamiento dinámico entre vistas.
   - Conecta cada formulario, tabla o acción interactiva con los endpoints reales (usando la variable de entorno base correspondiente: `NEXT_PUBLIC_API_URL`).
   - **4 Estados Obligatorios:** Implementa siempre en cada vista: Skeletons de carga (`Loading`), Renderizado de datos reales (`Success`), Vistas vacías amigables (`Empty State`) y Alertas con opción de reintento ante fallos de red (`Error State`).

---

## 5. Reglas de Negocio, Backend y Persistencia Políglota (GCP)
- **Estructura de Endpoints RESTful:** Valida exhaustivamente el uso correcto de los métodos HTTP (`GET`, `POST`, `PATCH`, `DELETE`) y verifica que los payloads y códigos de respuesta cumplan con la norma **RFC 9110**. Mantén segregación estricta entre endpoints de cliente final (`/api/v1/`) y de administración (`/api/v1/admin/`).
- **Lógica de Negocio y Algoritmos:** Utiliza el Algoritmo de Atenuación Temporal (Hot Ranking Decay) para la recomendación de contenidos y aplica el patrón de escritura pospuesta (*write-behind*) con procesamiento por lotes para el cálculo de reputación y karma masivo.
- **Estándares SQL y Jerarquías:** Todas las consultas y esquemas de Cloud SQL (PostgreSQL) deben respetar el esquema refactorizado. Es estrictamente obligatorio usar la extensión `ltree` con índices `GiST` para la gestión de hilos de comentarios anidados, erradicando por completo las consultas recursivas.
- **Bases de Datos Complementarias:** Redirige las notificaciones y el historial de chat privado hacia **Cloud Firestore**. Emplea **Cloud Memorystore (Redis)** exclusivamente para estados de presencia, limitadores de tasa (*rate limiters*) y almacenamiento en caché.

---

## 6. Seguridad y Prevención de Riesgos de Datos (CRÍTICO)
- **Cero Credenciales:** Tienes **ESTRICTAMENTE PROHIBIDO** almacenar, hardcodear o exponer contraseñas, claves privadas/RSA, API Keys, tokens JWT o credenciales de conexión a bases de datos en el código fuente (Frontend o Backend) o en la documentación.
- **Gestión de Secretos:** Maneja todas las credenciales y configuraciones sensibles mediante variables de entorno inyectadas directamente desde **Google Secret Manager** (en backend) y variables públicas seguras en tiempo de compilación (solo para rutas no sensibles en frontend).
- **Mitigación de Riesgos Perimetrales:** Asegura la compatibilidad e integración con **Cloud Armor** y **reCAPTCHA Enterprise (Account Defender)** en el Load Balancer y en los formularios críticos del Frontend para evaluar la puntuación de riesgo del tráfico y prevenir ataques de denegación de servicio (DDoS), granjas de bots y multicuentas.

---

## 7. Registro de Solución de Problemas (Troubleshooting)
- **Documentación Continua:** Cada vez que identifiques y soluciones un error técnico (ej. cuellos de botella en Cloud Run, errores de hidratación o CORS en Next.js, problemas de concurrencia, fallas de validación OAuth2/OIDC, o bloqueos/transacciones en PostgreSQL), debes documentar obligatoriamente la falla y su solución.
- **Archivo de Destino:** Añade una nueva entrada en el archivo `TROUBLESHOOTING.md` (o en la sección designada en `GEMINI.md`) utilizando estrictamente el siguiente formato:  
  `[Fecha/Hora] | [Capa: Frontend/Backend] | [Descripción del Error] | [Solución Aplicada]`.