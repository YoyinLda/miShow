# miShow

miShow es una plataforma para centralizar conciertos y eventos musicales publicados por distintas ticketeras y fuentes, facilitando su búsqueda y descubrimiento desde una experiencia mobile-first.

Este repositorio contiene el contexto inicial del producto, parsers ejecutables
de PuntoTicket, adquisición HTTP controlada y persistencia opcional en Supabase.
Todavía no incluye frontend ni una aplicación pública completa.

## Estado

Etapa 0 completa: flujo vertical de una fuente (PuntoTicket) de extremo a
extremo — adquisición HTTP controlada, extracción, normalización y persistencia
idempotente en PostgreSQL/Supabase, con pruebas. El esquema puede correr en un
stack local (Docker) o en un proyecto Supabase remoto. Aún no hay frontend, API
pública ni scraping programado (Etapa 1).

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

Requisitos: Node.js >=20.18.1. Este mínimo coincide con la dependencia efectiva
`cheerio@1.2.0` declarada en `package-lock.json`.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run qa
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm --silent run puntoticket:listing -- <ruta-html> [base-url]
npm --silent run puntoticket:detail -- <ruta-html> <source-url> <extracted-at>
```

`npm run dev` ejecuta Vitest en modo observación sobre los fixtures. Las CLI
ejecutables leen HTML local, escriben únicamente JSON válido en stdout y envían
errores a stderr; por eso se documentan con `npm --silent run`. Listing devuelve
`{ count, references, errors }`. Detail requiere siempre
`<extracted-at>` como timestamp ISO-8601 con zona horaria. Ninguna CLI realiza
adquisición HTTP programada.

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

La CLI de scraping mantiene su salida sin persistencia por defecto. Con
`--persist`, valida `SUPABASE_URL` y `SUPABASE_SECRET_KEY` antes de adquirir y
persiste por RPC atómicas. La configuración, migración, RLS, pruebas locales y
operación están documentadas en
[docs/persistencia-puntoticket-supabase.md](docs/persistencia-puntoticket-supabase.md).
Todavía no hay frontend, API pública ni scraping programado. `.local/`, `.env`,
`.kiro/settings/mcp.json` y los fixtures reales locales no se versionan.

## Base de datos y conexión

El esquema vive en `supabase/migrations/` y es la única fuente de verdad; no se
aceptan cambios hechos solo desde un dashboard. La migración crea 7 tablas
(`sources`, `events`, `performances`, `event_artists`, `event_venues`,
`scrape_runs`, `scrape_errors`), una vista pública de solo lectura
(`catalog_events_v1`) y cuatro funciones RPC (`start_scrape_run`,
`persist_normalized_event`, `record_scrape_error`, `finish_scrape_run`).

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
- `.kiro/settings/mcp.json` — servidor MCP de Supabase para el asistente, con su
  token de acceso.

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

La salida JSON incluye `run_id` y `status`. `succeeded`/`partial` terminan con
exit code `0`; una falla global o configuración inválida terminan con `1`.

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
2. Construir el frontend público (Next.js) consumiendo `catalog_events_v1`.
3. Automatizar el scraping con un cron (GitHub Actions) y añadir un indicador de
   última actualización.

## Nombre y marca

El nombre provisional es **miShow**. La identidad visual explorada utiliza un sombrero de copa con ojos, inspirada de manera no pública en una referencia cultural. Antes de publicar o escalar la marca se debe validar disponibilidad del nombre, dominio y posibles conflictos de propiedad intelectual.
