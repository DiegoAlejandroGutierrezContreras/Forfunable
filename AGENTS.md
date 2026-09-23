\# Directrices Principales del Agente de Desarrollo (Antigravity) para Plataforma de Comunidades en GCP



Eres un agente experto en desarrollo de software operando en el entorno de Antigravity. Tu objetivo es construir, validar y mantener esta plataforma de foros comunitarios hiper-escalable cumpliendo estrictamente con las siguientes reglas de negocio, seguridad y arquitectura en Google Cloud Platform (GCP)\[cite: 1].



\## 1. Integración de Conocimiento y Seguridad (MCP NotebookLM)

\* \*\*Consulta obligatoria:\*\* Debes utilizar activamente el MCP de NotebookLM configurado para este proyecto usando el ID base: `b4ae7351-4ea8-4726-815d-3c05dfaaab41`.

\* \*\*Desarrollo Seguro y Arquitectura:\*\* Extrae y aplica las directrices alojadas en NotebookLM, asegurando que los microservicios respeten la topología evaluada: despliegues en Cloud Run (usando Node.js/TypeScript o Go para baja latencia), integraciones de IA en FastAPI, y gestión de WebSockets en GKE Autopilot\[cite: 1].

\* \*\*Estructura de Endpoints RESTful:\*\* Antes de dar por finalizado un servicio, valida exhaustivamente el uso correcto de los métodos HTTP (GET, POST, PATCH, DELETE) y verifica que los payloads y códigos de respuesta cumplan con la norma RFC 9110\[cite: 1]. Mantén la segregación estricta entre los endpoints de cliente final (`/api/v1/`) y los de administración (`/api/v1/admin/`)\[cite: 1].



\## 2. Reglas de Negocio y Base de Datos (Persistencia Políglota GCP)

\* \*\*Lógica de Negocio y Algoritmos:\*\* Basa todas tus implementaciones en las reglas operativas del ecosistema. Utiliza el Algoritmo de Atenuación Temporal (Hot Ranking Decay) para la recomendación de contenidos y aplica el patrón de escritura pospuesta (write-behind) con procesamiento por lotes para el cálculo de reputación y karma masivo\[cite: 1].

\* \*\*Estándares SQL y Jerarquías:\*\* Todas las consultas y esquemas de Cloud SQL (PostgreSQL) deben respetar el esquema de base de datos refactorizado\[cite: 1]. Es estrictamente obligatorio usar la extensión `Itree` con índices `GiST` para la gestión de hilos de comentarios anidados, erradicando las consultas recursivas\[cite: 1].

\* \*\*Bases de Datos Complementarias:\*\* Redirige el almacenamiento de notificaciones y el historial del chat privado hacia Cloud Firestore\[cite: 1]. Emplea Cloud Memorystore (Redis) exclusivamente para estados de presencia, limitadores de tasa (rate limiters) y almacenamiento en caché\[cite: 1].



\## 3. Seguridad y Prevención de Riesgos de Datos (CRÍTICO)

\* \*\*Cero Credenciales:\*\* Tienes ESTRICTAMENTE PROHIBIDO almacenar, hardcodear o registrar contraseñas, claves RSA o tokens JWT en el código fuente o en la documentación.

\* \*\*Gestión de Secretos en GCP:\*\* Jamás debes exponer las credenciales de conexión a la base de datos\[cite: 1]. Maneja todo a través de variables de entorno inyectadas directamente desde Google Secret Manager\[cite: 1].

\* \*\*Mitigación de Riesgos Perimetrales:\*\* Integra validaciones estrictas con Cloud Armor y reCAPTCHA Enterprise (Account Defender) en la capa del Load Balancer para evaluar la puntuación de riesgo del tráfico y prevenir ataques de denegación de servicio (DDoS), granjas de bots y multicuentas\[cite: 1].



\## 4. Registro de Solución de Problemas (Troubleshooting)

\* \*\*Documentación Continua:\*\* Cada vez que generes, identifiques y soluciones un error técnico (por ejemplo, cuellos de botella en Cloud Run, problemas de concurrencia, fallas de validación de tokens OAuth2/OIDC, o bloqueos de transacciones en PostgreSQL), debes documentar obligatoriamente la falla y su solución\[cite: 1].

\* \*\*Archivo de Destino:\*\* Almacena estos registros añadiendo una nueva entrada en el archivo `TROUBLESHOOTING.md` (o en la sección designada en `GEMINI.md`). El formato debe incluir: \[Fecha/Hora], \[Descripción del Error], y \[Solución Aplicada].

