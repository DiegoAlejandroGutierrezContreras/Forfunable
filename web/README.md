# Forfunable Web (Next.js)

Frontend nuevo en Next.js 15 + TypeScript + Tailwind. Convive con `frontend/` (HTML/JS servido por el backend Go) hasta que este lo reemplace.

## Qué incluye esta base

| Archivo | Propósito |
| :--- | :--- |
| `next.config.js` | Proxy `/api/*` → `BACKEND_URL` (same-origin, necesario para las cookies `SameSite=Strict`) y salida `standalone` |
| `middleware.ts` | CSP con nonce por petición (UX_MAPPING.md §4.2) |
| `tailwind.config.ts` | Tokens de *Obsidian Signal* (DESIGN.md) |
| `lib/api.ts` | `apiFetch`: token en memoria, `X-CSRF-Token` automático en mutaciones, errores tipados |
| `Dockerfile` | Imagen standalone, usuario no root (UID 10001), puerto 8080 |

## Desarrollo local

```powershell
cd web
copy .env.example .env.local   # ajustar BACKEND_URL (local o Cloud Run)
npm install
npm run dev                    # http://localhost:3000
```

Con `BACKEND_URL` apuntando a Cloud Run, el backend corre con `APP_ENV=production` y emite cookies `Secure`. Los navegadores las aceptan en `http://localhost`, pero no en otro host sin HTTPS.

## Despliegue en Cloud Run

`BACKEND_URL` se fija en el **build**, no en runtime:

```powershell
$IMAGE = "REGION-docker.pkg.dev/PROYECTO/forfunable/web"
docker build --build-arg BACKEND_URL=https://forfunable-api-XXXX.run.app -t $IMAGE web
docker push $IMAGE
gcloud run deploy forfunable-web --image $IMAGE --region REGION --allow-unauthenticated
```

(`gcloud builds submit --tag` no admite `--build-arg`; para Cloud Build sin Docker local hace falta un `cloudbuild.yaml` que lo pase.)

## Prompt para el agente de Antigravity (con Stitch conectado)

> Lee AGENTS.md, DESIGN.md y UX_MAPPING.md. Dame primero el plan, sin escribir código. Trabaja solo dentro de `web/`, reutilizando `lib/api.ts`, `tailwind.config.ts` y `middleware.ts`. Empieza solo por `/login`, `/register` y `/` (feed), leyendo esas pantallas desde Stitch. Cada vista debe tener los 4 estados (Loading, Success, Empty, Error con reintento). Login y registro deben enviar `recaptcha_token` generado con `grecaptcha.enterprise.execute(NEXT_PUBLIC_RECAPTCHA_SITE_KEY, { action: 'LOGIN' | 'REGISTER' })`, cargando el script con el nonce de la cabecera `x-nonce`.
