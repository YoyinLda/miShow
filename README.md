# miShow

miShow es una plataforma para centralizar conciertos y eventos musicales publicados por distintas ticketeras y fuentes, facilitando su búsqueda y descubrimiento desde una experiencia mobile-first.

Este repositorio es un monorepo (npm workspaces) con los scrapers (PuntoTicket y Ticketmaster sobre un núcleo compartido),
la persistencia en Supabase, los paquetes compartidos y un frontend web
(Next.js) que muestra el catálogo.

## Estado

MVP en producción: https://mishow.pages.dev (Cloudflare Pages, SSG).

- **Scraping multi-fuente:** PuntoTicket y Ticketmaster sobre un núcleo compartido,
  con persistencia idempotente en Supabase. Cron 2×/día en GitHub Actions
  (ver `docs/operacion-scraping-cron.md`).
- **Modelo canónico (v2):** Event / EventSource / Performance / Artist / Venue con
  deduplicación multi-fuente; el front lee la vista `catalog_events_v2`
  (ver `docs/modelo-datos.md`).
- **Frontend (Next.js, SSG):** Home de descubrimiento (`/`) y Catálogo (`/eventos`)
  rediseñados según el Figma de referencia (brief 005). Incluye: hora desconocida
  mostrada solo con fecha, scroll infinito (keyset), modo oscuro con toggle de 3
  modos (claro/oscuro/sistema), chips de rango (Hoy/Semana/Mes/Gratis) e identidad
  violeta. Despliegue automático a Cloudflare Pages al hacer push a `main`
  (ver `docs/despliegue-cloudflare-pages.md`).
- **Pendiente:** filtros avanzados (fuente/ciudad/recinto/estado — brief
  `docs/briefs/005-etapa5-filtros.md`), y datos de origen para destacados reales,
  precio gratis y escena local (hoy estructura sin datos).

El esquema corre en un stack local (Docker) o en el proyecto Supabase remoto.

## Estructura del repositorio

```text
mishow/
├── package.json              # workspaces + scripts orquestadores
├── tsconfig.base.json        # config TS compartida (moduleResolution Bundler)
├── apps/
│   └── web/                  # @mishow/web — frontend Next.js (SSG)
├── packages/
│   ├── domain/               # @mishow/domain — contratos, url, time compartidos
│   └── catalog-client/       # @mishow/catalog-client — lectura del catálogo (Data API)
├── scrapers/
│   ├── core/                 # @mishow/scraper-core — motor genérico (HTTP, orquestador, política, normalización, persistencia) + SourceAdapter
│   ├── puntoticket/          # @mishow/scraper-puntoticket — adaptador PuntoTicket (listado/detalle) + CLI
│   └── ticketmaster/         # @mishow/scraper-ticketmaster — adaptador Ticketmaster (listado/detalle) + CLI
├── supabase/                 # esquema (migraciones + tests pgTAP), transversal
├── infra/                    # reservado para IaC futura (ver infra/README.md)
└── docs/
```

Reglas de frontera: cada paquete declara sus dependencias y se importa por nombre
`@mishow/*`; no hay imports que crucen carpetas de otros paquetes. Esto permite
dividir un workspace en su propio repositorio en el futuro sin reescrituras (ver
`infra/README.md`). Los tests están co-ubicados por workspace.

## Objetivo inicial

- Reunir eventos musicales desde múltiples fuentes.
- Normalizar artistas, recintos, fechas, precios y enlaces de compra.
- Permitir búsqueda y exploración simple de eventos.
- Mantener trazabilidad sobre la fuente original.
- Preparar una arquitectura que pueda crecer sin sobredimensionar el MVP.

## Arquitectura propuesta

- Frontend: Next.js, React y Tailwind CSS, con enfoque mobile-first.
- Hosting frontend: Amazon S3 y CloudFront.
- API pública: AWS Lambda y API Gateway.
- Orquestación privada: AWS Lambda.
- Scrapers: Playwright o Puppeteer ejecutados en ECS Fargate Tasks.
- Base de datos: Amazon RDS PostgreSQL.
- Procesamiento asíncrono: Amazon SQS.
- Programación de procesos: Amazon EventBridge.
- Correos: Amazon SES.
- Observabilidad: logs estructurados y trazabilidad W3C Trace Context.

La arquitectura AWS anterior es una propuesta histórica/alternativa futura, no infraestructura implementada. Consulta [docs/brief-ejecucion.md](docs/brief-ejecucion.md) para la estrategia por etapas y [docs/arquitectura.md](docs/arquitectura.md) para el contexto.

## Base fixture-first de PuntoTicket

La base técnica del scraper está en `src/puntoticket`. Es deliberadamente pura:
recibe HTML, extrae referencias o detalles, y normaliza sin red, Playwright ni
persistencia. Las URLs `source_url` y `purchase_url` se conservan separadas; el
segundo enlace solo se identifica y nunca se sigue.

Requisitos: Node.js >=20.19.0 (el proyecto y CI usan 24.21.0). En Windows, ver
[docs/entorno-desarrollo-windows.md](docs/entorno-desarrollo-windows.md).

Comandos desde la raíz (operan sobre todos los workspaces con `--if-present`):

```bash
npm install                # instala y enlaza los workspaces
npm run qa                 # typecheck + lint + test de todos los workspaces
npm test                   # tests (scraper + catalog-client)
npm run typecheck
npm run lint
npm run supabase:start
npm run supabase:reset
npm run supabase:test
# CLIs de los scrapers (delegan a cada workspace de fuente):
npm --silent run puntoticket:listing   -- <ruta-html> [base-url]
npm --silent run puntoticket:detail    -- <ruta-html> <source-url> <extracted-at>
npm --silent run ticketmaster:listing  -- <ruta-html> [base-url]
npm --silent run ticketmaster:detail   -- <ruta-html> <source-url> <extracted-at>
# Adquisición HTTP real (requiere --live). --persist escribe en Supabase:
npm --silent run puntoticket:scrape   -- --live [--persist] [--concurrency 2] [--delay-ms 1500]
npm --silent run ticketmaster:scrape  -- --live [--persist] [--concurrency 2] [--delay-ms 1500]
```

Comandos por workspace (con `-w`):

```bash
npm run dev   -w @mishow/web              # frontend en desarrollo
npm run build -w @mishow/web              # export estático a apps/web/out
npm test      -w @mishow/scraper-puntoticket
```

Las CLI del scraper leen HTML local, escriben únicamente JSON válido en stdout y
envían errores a stderr; por eso se documentan con `npm --silent run`. Listing
devuelve `{ count, references, errors }`. Detail requiere siempre `<extracted-at>`
como timestamp ISO-8601 con zona horaria. Ninguna CLI realiza adquisición HTTP
programada.

Los fixtures sintéticos de `tests/puntoticket.test.ts` cubren rutas de evento
relativas y absolutas, landings respaldadas por tarjetas estructurales,
deduplicación, funciones múltiples, estados, cola de compra, JSON-LD inválido
y zona horaria `America/Santiago`, incluyendo identificadores por performance,
fechas calendario inválidas, ruta raíz, tipos JSON-LD `Event` completos,
metadatos HTTPS/coordenadas y precios límite. Los
enlaces de compra solo se conservan si son HTTPS del host exacto
`www.puntoticket.com` y usan rutas permitidas
`/queue/enqueue/<codigo>` o `/comprar/evento/<codigo>/cal/<calendario>`.
Nunca se siguen durante adquisición. La extracción reporta JSON-LD inválido y
funciones rechazadas por fecha en `ExtractionResult.errors` sin perder el HTML
crudo.

Las funciones se identifican por su fecha y hora normalizadas. Los bloques
comerciales sin fecha se asocian únicamente cuando existe una sola función
conocida; si la asociación no es segura, se reporta
`ambiguous performance purchase mapping`, el evento puede quedar globalmente
`available` y la función permanece `unknown` sin `purchase_url`. Las fechas
mencionadas en textos legales de venta no se interpretan como fechas de
función. `extracted_at` debe ser un timestamp ISO-8601 con zona horaria.

Consulta [docs/ejecucion-fixture-first-puntoticket.md](docs/ejecucion-fixture-first-puntoticket.md)
para la instalación normal y limpia, el alcance detallado de las pruebas,
troubleshooting y el handoff para QA.

Las CLI de scraping (`puntoticket:scrape` y `ticketmaster:scrape`) mantienen su
salida sin persistencia por defecto. Con `--persist`, validan `SUPABASE_URL` y
`SUPABASE_SECRET_KEY` antes de adquirir y persisten por RPC atómicas idempotentes
por `source_id`. La configuración, migración, RLS, pruebas locales y operación
están documentadas en
[docs/persistencia-puntoticket-supabase.md](docs/persistencia-puntoticket-supabase.md)
y la operación por cron en
[docs/operacion-scraping-cron.md](docs/operacion-scraping-cron.md).

Nota por fuente: algunos eventos de Ticketmaster no exponen precio en el HTML
inicial (su JSON-LD trae `offers: []`; el precio se carga por JS). En esos casos
el evento se conserva sin precio y la UI lo indica de forma amable; no se inventan
valores. La imagen de Ticketmaster se toma de `og:image` cuando el JSON-LD no la
trae. `.local/`, `.env`, `.kiro/settings/mcp.json` y los fixtures reales locales
no se versionan.

## Base de datos y conexión

El esquema vive en `supabase/migrations/` y es la única fuente de verdad; no se
aceptan cambios hechos solo desde un dashboard. El **modelo canónico** (brief 003)
separa el evento de la fuente: tablas `sources`, `events` (canónico, con `slug`),
`event_sources` (observación por fuente), `artists`, `venues`, `event_artists`
(N:M), `performances`, más `scrape_runs`/`scrape_errors`. Vistas públicas de solo
lectura: `catalog_events_v2` (evento canónico con `sources[]`, `artists[]`,
`venue`, `performances[]`), `catalog_artists_v1` y `catalog_venues_v1` (entidad +
próximos eventos). RPCs: `start_scrape_run`, `persist_normalized_event` (dedup
conservadora por `match_key`), `record_scrape_error`, `finish_scrape_run`. Ver
[docs/modelo-datos.md](docs/modelo-datos.md).

La aplicación no usa un cliente pesado: llama a la Data API por HTTP
(`POST {SUPABASE_URL}/rest/v1/rpc/<funcion>`) con la clave privada en el header
`apikey`. Las identidades naturales son `events(source_id, source_url)` y
`performances(event_id, starts_at)`, lo que hace la persistencia idempotente:
reprocesar el mismo evento actualiza y no duplica.

### Entornos

- **Local (Docker):** `npm run supabase:start` levanta un stack completo y
  aplica las migraciones. Imprime la URL y las llaves locales, que copias a un
  `.env` no versionado.
- **Remoto (Supabase Cloud):** la app apunta al proyecto remoto con las mismas
  dos variables. El esquema se aplica al remoto con las migraciones de
  `supabase/migrations/`.

### Dónde están las credenciales (fuera de git)

Por seguridad, el identificador del proyecto remoto y las claves no se versionan.
Se configuran en dos lugares locales, ambos ignorados por git:

- `.env` — consumido por la app: `SUPABASE_URL` y `SUPABASE_SECRET_KEY`
  (ver formato en `.env.example`).
- `~/.kiro/settings/mcp.json` (configuración de usuario, fuera del repo) —
  servidor MCP de Supabase para el asistente, con su token de acceso (PAT).

El `project ref`, la URL del proyecto y las llaves se obtienen del dashboard de
Supabase (Project Settings → API) o de esos archivos locales. No los copies a
archivos versionados.

### Persistencia real desde la CLI

La app no carga `.env` automáticamente; exporta las variables al entorno del
proceso antes de ejecutar:

```bash
set -a; . ./.env; set +a
npm --silent run puntoticket:scrape -- --live --persist --max-events 1
```

En PowerShell, ver la sección "Cargar `.env`" de
[docs/entorno-desarrollo-windows.md](docs/entorno-desarrollo-windows.md).

La salida JSON incluye `run_id` y `status`. `succeeded`/`partial` terminan con
exit code `0`; una falla global o configuración inválida terminan con `1`.

## Frontend (apps/web)

`@mishow/web` es un frontend Next.js mobile-first con export estático (SSG).
Muestra un listado de eventos con búsqueda básica, vista de detalle (artistas,
recinto, funciones y precios) y **páginas de Artista (`/artistas?slug=`) y Venue
(`/venues?slug=`)** con sus próximos eventos y enlaces cruzados. Un evento
publicado en varias ticketeras muestra su **cobertura multi-fuente**: precio
combinado y un botón por cada ticketera. Como miShow es un puente hacia las
ticketeras y no la fuente de verdad de la disponibilidad, cada evento ofrece
siempre un enlace "Ir a la ticketera" (desde `sources[]`) tanto en el listado
como en el detalle; la compra se completa en la ticketera. La presentación del
estado asume **Confirmado** por defecto (estado `unknown`), conserva "Disponible",
"Agotado" y "Próximamente" cuando hay evidencia, y omite la etiqueta de estado
por función cuando no hay información de disponibilidad. El contrato, la base de
datos y el scraper no cambian: es solo una capa de presentación (ver
[docs/decisiones-tecnicas.md](docs/decisiones-tecnicas.md)).

Todo el acceso a datos pasa por `@mishow/catalog-client`, que lee las vistas
públicas `catalog_events_v2`, `catalog_artists_v1` y `catalog_venues_v1` mediante
la Data API con la **clave publishable**
(solo lectura, protegida por RLS). Ningún componente llama directamente a
Supabase, y la secret key nunca llega al navegador. Esta frontera única facilita
migrar en el futuro a una capa intermedia (Cloudflare Worker) sin tocar la UI.

Variables públicas del frontend (ver `apps/web/.env.example`), en un
`.env.local` no versionado:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

```bash
npm run dev   -w @mishow/web    # http://localhost:3000
npm run build -w @mishow/web    # genera apps/web/out (estático)
```

El modo estático y la ruta de migración a híbrido (SSR/ISR) están documentados en
`apps/web/next.config.mjs`.

Para una prueba completa en local conectada a Supabase cloud (sincronizar
esquema, cargar datos con un scraping real y verificar el catálogo en el
navegador), ver
[docs/prueba-local-e2e-cloud.md](docs/prueba-local-e2e-cloud.md).

## Onboarding para un asistente

Para que un agente (Kiro, Codex u otro) entienda el proyecto:

```text
Lee AGENTS.md y todos los archivos de docs/. Resume tu comprensión del proyecto y enumera las decisiones pendientes. No escribas código todavía.
```

Documentos clave: [docs/brief-ejecucion.md](docs/brief-ejecucion.md) (estrategia
por etapas), [docs/modelo-datos.md](docs/modelo-datos.md) y
[docs/persistencia-puntoticket-supabase.md](docs/persistencia-puntoticket-supabase.md)
(esquema y operación).

## Próximos pasos sugeridos

1. Definir las decisiones abiertas del brief (fuente, cobertura, campos
   obligatorios, métrica de validación).
2. ~~Construir el frontend público (Next.js) consumiendo `catalog_events_v1`.~~
   Hecho: MVP web (listado, detalle, búsqueda) sobre `catalog_events_v1`.
   Migrado a `catalog_events_v2` + páginas de Artista y Venue en el brief 004
   (frontend v2).
3. ~~Automatizar el scraping con un cron (GitHub Actions) y añadir un indicador de
   última actualización.~~ Hecho: workflow programado
   (`.github/workflows/scrape-puntoticket.yml`, ver
   [docs/operacion-scraping-cron.md](docs/operacion-scraping-cron.md)) e indicador
   de frescura en la web vía `catalog_freshness_v1`.
4. Cargar los secrets del cron y del despliegue, ejecutar la primera corrida
   manual y publicar el frontend en Cloudflare Pages (ver
   [docs/despliegue-cloudflare-pages.md](docs/despliegue-cloudflare-pages.md)).
5. ~~Agregar una segunda fuente.~~ Hecho: **Ticketmaster** sobre el núcleo
   compartido `@mishow/scraper-core` (arquitectura multi-fuente vía `SourceAdapter`),
   con su propio cron (`.github/workflows/scrape-ticketmaster.yml`). Ver
   [docs/briefs/001-fuente-ticketmaster.md](docs/briefs/001-fuente-ticketmaster.md).

## Nombre y marca

El nombre provisional es **miShow**. La identidad visual explorada utiliza un sombrero de copa con ojos, inspirada de manera no pública en una referencia cultural. Antes de publicar o escalar la marca se debe validar disponibilidad del nombre, dominio y posibles conflictos de propiedad intelectual.
