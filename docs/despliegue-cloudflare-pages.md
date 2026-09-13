# Despliegue del frontend en Cloudflare Pages

Guía para publicar el frontend estático `@mishow/web` en Cloudflare Pages a costo
cero. Esta etapa deja todo listo (workflow + configuración) para que el TL/PO
cargue los secrets y ejecute; no despliega ni carga credenciales automáticamente.

El workflow vive en `.github/workflows/deploy-web.yml`.

## Qué se despliega

- `@mishow/web` es un frontend Next.js con **export estático** (`output:
  "export"`), cuyo build genera `apps/web/out`.
- El catálogo se lee en el navegador desde la Data API de Supabase (vista
  `catalog_events_v1` y RPC `catalog_freshness_v1`) con la **clave publishable**
  (solo lectura, protegida por RLS). Por eso no hace falta reconstruir el sitio
  cuando cambian los datos: solo cuando cambia el código del frontend.

## Costo cero

El plan gratuito de Cloudflare Pages admite (según la documentación consultada)
500 builds/mes. El workflow se dispara por **cambios de código** del frontend
(push a `main` en rutas relevantes) y por ejecución manual, no por cada corrida
del scraper. Así el consumo de builds se mantiene bajo.

## Prerrequisitos (los realiza el TL/PO)

1. **Proyecto Supabase remoto** con las migraciones de `supabase/migrations/`
   aplicadas (incluye la vista `catalog_events_v1` y la RPC de frescura).
2. **Proyecto de Cloudflare Pages** ya creado (una vez), cuyo nombre se usará como
   `CLOUDFLARE_PAGES_PROJECT`.
3. **Token de Cloudflare** con permiso *Cloudflare Pages: Edit* y el *Account ID*.

## Secrets y variables en GitHub

En **Settings → Secrets and variables → Actions**:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Token con permiso Cloudflare Pages: Edit. |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Account ID de Cloudflare. |
| Secret | `NEXT_PUBLIC_SUPABASE_URL` | URL de la Data API (`https://<ref>.supabase.co`). |
| Secret | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publishable (solo lectura). |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | Nombre del proyecto de Pages. |

Seguridad:

- **Solo la clave publishable** llega al navegador. Nunca cargar
  `SUPABASE_SECRET_KEY` ni tokens privados en este workflow.
- Las variables `NEXT_PUBLIC_*` se incrustan en el bundle en tiempo de build: por
  definición son públicas y de solo lectura.

## Flujo del workflow

1. `actions/checkout` + `actions/setup-node` (Node 20.18.1, cache npm).
2. `npm ci`.
3. `npm run build -w @mishow/web` con las variables `NEXT_PUBLIC_*` → genera
   `apps/web/out`.
4. `cloudflare/wrangler-action` publica `apps/web/out` en el proyecto de Pages
   (`pages deploy apps/web/out --project-name=<proyecto> --branch=main`).

## Verificación local del build

Antes de configurar el workflow se puede reproducir el build localmente:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
npm run build -w @mishow/web
# genera apps/web/out
```

El build estático se validó en esta etapa: compila y genera `apps/web/out` con
las rutas `/`, `/_not-found` y `/evento` como contenido estático.

## Variables del frontend en desarrollo

Para desarrollo local, `apps/web/.env.local` (no versionado) define:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Ver `apps/web/.env.example` para el formato con valores ficticios.

## Migración futura (documentada, no implementada)

- **SSG → híbrido (SSR/ISR):** los pasos están en `apps/web/next.config.mjs`. La
  capa de datos (`@mishow/catalog-client`) no cambia.
- **Acceso directo → capa intermedia (Worker/API):** como todo el acceso a datos
  pasa por `@mishow/catalog-client`, migrar significa reimplementar ese cliente
  apuntando al nuevo endpoint, sin tocar la UI.

## Rollback

Cloudflare Pages conserva historial de despliegues: se puede revertir a un
despliegue anterior desde su dashboard. Para detener publicaciones automáticas,
deshabilitar el workflow en la pestaña **Actions** o revertir el archivo YAML.
