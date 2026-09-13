# Brief 003 — Modelo canónico de eventos (Event / EventSource / Performance / Artist / Venue)

- **Estado:** Completado (2026-09-13). Migración aplicada y verificada en cloud.
  Decisiones cerradas:
  - **D1=b** — reescritura del esquema (no aditiva).
  - **D2=a** — `events` pasa a ser la tabla canónica nueva; las observaciones por
    fuente van a `event_sources`.
  - **D3=a** — infra + matching conservador + revisión manual (`needs_review`).
  - **D4=b** — se crea `catalog_events_v2`; **`catalog_events_v1` se retira** y el
    frontend queda temporalmente **no funcional** hasta un brief posterior de
    migración del front. Este brief incluye reescribir esquema + persistencia +
    `catalog_events_v2`.
  - **D5=a** — Artist/Venue derivados de `normalized_name` con `slug` automático.
  - **Migración destructiva + re-scrape:** se hace drop/recreate del esquema de
    catálogo; los datos actuales (108 eventos) NO se preservan, se regeneran
    corriendo el cron sobre el modelo nuevo. Aceptado por ser repoblable.
- **Fecha:** 2026-09-13
- **Roadmap:** V1, Etapa 2A (P0). Ver `docs/briefs/miShow_V1_definicion_roadmap.md`.
- **Rama sugerida:** `feat/canonical-events`.
- **Depende de:** Briefs 001 y 002 (multi-fuente + Ticketmaster) completados.

---

## 1. Contexto y problema

Hoy el catálogo está **acoplado a la fuente**: la tabla `events` tiene `source_id`
(FK a `sources`), de modo que cada fuente crea su **propia fila de evento**. Un
mismo concierto publicado en PuntoTicket y Ticketmaster aparece como **dos
eventos distintos**. Artistas y venue están **embebidos por evento**
(`event_artists`, `event_venues` 1:1), no son entidades reутilizables.

El roadmap V1 exige (P0) evolucionar hacia un **evento canónico** independiente
de la ticketera, con `Artist` y `Venue` como entidades propias, y deduplicación
multi-fuente. Es la principal deuda estructural antes de agregar más fuentes,
páginas de artista/venue, filtros y comunidad.

## 2. Estado actual (verificado en cloud y código, 2026-09-13)

Esquema `public` (Supabase):

- `sources(id, code, name, base_url, ...)` — 2 filas (puntoticket, ticketmaster).
- `events(id, source_id FK, source_url, source_code, purchase_url, image_url,
  name, status, price_min/max, currency, source_extracted_at, first/last_seen)`
  — 108 filas. **Acoplado a fuente** (unique `(source_id, source_url)`).
- `performances(id, event_id FK, starts_at, timezone, status, performance_code,
  purchase_url, ...)` — 122 filas.
- `event_artists(event_id, normalized_name, name, position, ...)` — 48 filas.
  Embebido; PK `(event_id, normalized_name)`.
- `event_venues(event_id PK, name, address, city, lat, lon, ...)` — 108 filas.
  Embebido 1:1.
- `scrape_runs`, `scrape_errors` — operacional.

Contrato con el frontend:

- Vista `public.catalog_events_v1` (security_invoker) expone por fila-evento:
  `source`, `source_url`, `source_code`, `purchase_url`, `image_url`, `name`,
  `status`, precios, `next_performance_at`, `artists[]`, `venue`, `performances[]`.
- RPC `catalog_freshness_v1(p_source)`.
- `@mishow/catalog-client` (`CatalogEvent`) es la ÚNICA forma que consume la web
  (`EventList`, `EventDetail`, `EventCard`). Cambiar la vista sin cambiar su forma
  mantiene la UI intacta.

Persistencia (RPCs): `start_scrape_run`, `persist_normalized_event`,
`record_scrape_error`, `finish_scrape_run`. `persist_normalized_event` hace upsert
en `events` por `(source_id, source_url)` + tablas embebidas.

**Punto crítico de compatibilidad:** `catalog_events_v1` asume 1 fila = 1 evento
= 1 fuente. Con eventos canónicos multi-fuente, la vista debe recomponer
`source`/`source_url`/`purchase_url` (que pasan a ser N por evento) sin romper el
contrato de `CatalogEvent`, o versionarse a `_v2`.

## 3. Decisiones a validar con TL/PO

- **D1. Estrategia de migración del esquema.**
  - (a) **Aditiva por capas:** crear tablas nuevas (`artists`, `venues`,
    `canonical_events`, `event_sources`) junto a las actuales; poblar por
    backfill; migrar la vista; luego deprecar lo viejo en un brief posterior.
    Menor riesgo, reversible. *(recomendada)*
  - (b) Reescritura del esquema en una migración grande (más limpio, más riesgo).

- **D2. ¿`events` se renombra o se reinterpreta?**
  - (a) La tabla `events` actual pasa a ser **`event_sources`** (observación por
    fuente) y se crea una tabla nueva `events` canónica con `id` propio y FK
    `canonical`. Requiere cuidado con FKs existentes (`performances`,
    `event_artists`, `event_venues` apuntan a `events`). *(recomendada, ver §5)*
  - (b) Mantener `events` como está y crear `canonical_events` + `event_id`
    (canónico) como columna nueva; menos disruptivo pero deja dos conceptos de
    "event" conviviendo.

- **D3. Alcance de la deduplicación en este brief.**
  - (a) **Infra + matching conservador + revisión manual:** implementar el modelo,
    el backfill 1:1 (cada source-event → su propio canónico) y un matcher
    conservador que solo une con alta confianza; los inciertos quedan separados y
    marcados para revisión. *(recomendada)*
  - (b) Deduplicación automática agresiva (rechazada: riesgo de unir conciertos
    distintos, contra el principio del roadmap §22.2).

- **D4. Compatibilidad del contrato del frontend.**
  - (a) **Mantener `catalog_events_v1` y `CatalogEvent`** recomponiendo la vista
    sobre el modelo canónico: `source`/`source_url`/`purchase_url` se resuelven a
    la "mejor" fuente (o una primaria) para no romper la UI; agregar `sources[]`
    como campo nuevo opcional para exponer todas. La web no cambia en este brief.
    *(recomendada)*
  - (b) Crear `catalog_events_v2` y migrar la web (más trabajo, fuera de 2A).

- **D5. Identidad de Artist/Venue.**
  - (a) Derivar de los datos ya normalizados (`normalized_name` de
    `event_artists`/`event_venues`) para el backfill; `slug` generado desde el
    nombre normalizado con desambiguación. *(recomendada)*
  - (b) Curación manual inicial (no escalable ahora).

## 4. Modelo propuesto (conceptual)

```text
sources           (ticketera/fuente; ya existe)
artists           (entidad propia; slug único)
venues            (entidad propia; slug único)
events            (canónico; slug; venue_id; category; status; image_url)
event_sources     (observación por fuente: event_id, source_id, source_url,
                   purchase_url, source_code, price, status, last_seen_at)
event_artists     (N:M event <-> artist, con posición)
performances      (event_id canónico; fecha/estado/precio por función)
```

- **Event canónico:** `id, slug, name, category (default 'musica'), subcategory,
  description?, venue_id?, status, image_url?, first_seen_at, last_seen_at`.
- **EventSource:** una fila por (evento, fuente) — reemplaza el rol actual de
  `events`. Conserva `source_url`, `purchase_url`, `source_code`, precio/estado
  observados y `last_seen_at`. Unique `(source_id, source_url)`.
- **Artist:** `id, slug, name, normalized_name, description?, city?, country?,
  genre?, image_url?, links jsonb?, verified bool`. Unique `normalized_name`.
- **Venue:** `id, slug, name, normalized_name, address?, city?, lat?, lon?,
  capacity?, links jsonb?, image_url?`. Unique `normalized_name` (o por ciudad).
- **event_artists:** N:M `(event_id, artist_id, position)`.
- **performances:** pasa a colgar del evento canónico.

## 5. Diseño de migración (D1=b reescritura, destructiva + re-scrape)

Una migración de **reescritura del esquema de catálogo**. Como los datos se
regeneran con el cron, se hace drop/recreate de las tablas de catálogo (NO de
`sources`, `scrape_runs`, `scrape_errors`, que se conservan/ajustan). Orden:

1. **Drop** de las tablas de catálogo actuales y de la vista `catalog_events_v1`:
   `event_artists`, `event_venues`, `performances`, `events` (en orden de FKs).
   `sources` se conserva. (Las RPCs se recrean en el paso 6.)
2. **Crear entidades canónicas:**
   - `artists (id, slug unique, normalized_name unique, name, description?, city?,
     country?, genre?, image_url?, links jsonb?, verified bool, timestamps)`.
   - `venues (id, slug unique, normalized_name, name, address?, city?, lat?, lon?,
     capacity?, links jsonb?, image_url?, timestamps)`.
   - `events` **canónico** `(id, slug unique, name, category default 'musica',
     subcategory?, description?, venue_id? FK, status, image_url?, needs_review
     bool default false, first_seen_at, last_seen_at, timestamps)`.
   - `event_sources (id, event_id FK, source_id FK, source_url, source_code?,
     purchase_url?, status, price_min?, price_max?, currency?, source_extracted_at,
     first_seen_at, last_seen_at, unique (source_id, source_url))`.
   - `event_artists (event_id FK, artist_id FK, position, primary key
     (event_id, artist_id))` — N:M.
   - `performances (id, event_id FK canónico, starts_at, timezone, status,
     performance_code?, purchase_url?, source_extracted_at, ...)`.
3. **Índices y constraints** equivalentes a los actuales (status check, https
   checks, índices de búsqueda por fecha/estado) más los nuevos (slug, FKs).
4. **RLS**: políticas de solo lectura para `anon`/`authenticated` en las tablas
   que alimentan la vista (igual patrón que hoy).
5. **`catalog_events_v2`**: vista nueva que expone el evento canónico con
   `sources[]` (todas las fuentes con su `source_url`/`purchase_url`), `artists[]`
   (con slug), `venue` (con slug), `performances[]`, `next_performance_at`. NO se
   crea `catalog_events_v1`: el frontend actual queda no funcional hasta su brief.
6. **RPCs de persistencia canónica** (`start_scrape_run` se conserva; se reescribe
   `persist_normalized_event`): por cada evento normalizado, resolver/crear
   `artists` y `venue` (por `normalized_name`/slug), resolver/crear el `event`
   canónico (matching en ingesta, ver §5.1), upsert de `event_sources` por
   `(source_id, source_url)` y de `performances`. Idempotente.

### 5.1 Matching / deduplicación conservadora (D3=a)

En la ingesta, un evento entrante se asocia a un canónico existente **solo** con
señales fuertes: mismo `venue` (normalizado) + solapamiento de fecha/hora de
performance + artista o nombre normalizado coincidente. Si no hay match seguro,
se crea un canónico nuevo. Un proceso/consulta posterior puede marcar
`needs_review = true` en grupos sospechosos para revisión manual; **nunca** se
fusiona automáticamente sin señales fuertes (roadmap §22.2).

## 6. Impacto por componente

- **DB:** varias migraciones aditivas (§5). Reversibles.
- **`@mishow/scraper-core` / adaptadores:** `NormalizedEvent` ya trae artists[] y
  venue; el cambio está en la **capa de persistencia** (mapping + RPC), no en la
  extracción. El matching en ingesta vive en la RPC o en un paso posterior.
- **`@mishow/catalog-client`:** consumía `catalog_events_v1`, que se retira. En
  este brief queda **desalineado** (no funcional) hasta el brief de migración del
  front, que lo apuntará a `catalog_events_v2`. Se documenta el estado transitorio.
- **Frontend:** queda **temporalmente no funcional** (D4=b) hasta su brief de
  migración. Es una decisión aceptada de TL/PO.

## 7. Fuera de alcance (de este brief)

- Páginas `/artistas/{slug}` y `/venues/{slug}` (brief 004).
- Filtros de catálogo y nueva home (brief 005).
- Comunidad / tocatas / auth / moderación (briefs 006+).
- Deduplicación automática agresiva o basada en ML.
- Tercera fuente.

## 8. Checklist de tareas

> `[ ]` pendiente · `[x]` hecho.

- [x] **T1.** Decisiones cerradas: D1=b, D2=a, D3=a, D4=b, D5=a, migración
  destructiva + re-scrape (ver cabecera).
- [x] **T2/T3/T4.** Migración `20260913200727_canonical_events_model` aplicada en
  cloud: drop del catálogo viejo (conservando `sources`/`scrape_runs`/`scrape_errors`)
  + creación de `artists`, `venues`, `events` (canónico con `slug`/`match_key`),
  `event_sources`, `event_artists` (N:M), `performances`, con índices, constraints,
  RLS y grants + vista `catalog_events_v2`. Helpers `unaccent_simple`,
  `mishow_slugify`, `mishow_unique_slug`.
- [x] **T5.** `persist_normalized_event` reescrita: resuelve/crea `venue` y
  `artists` por `normalized_name`, resuelve/crea el `event` canónico por
  `match_key`, upsert de `event_sources` y `performances`. Idempotente. **El
  mapping del core NO cambió** (el payload por-evento es el mismo); no hubo cambios
  de código TS.
- [x] **T6.** Deduplicación conservadora validada: `match_key =
  venue_norm|nombre_norm`. Caso ambiguo NO fusiona ("Alberto Plaza" en Dreams
  Valdivia vs Puerto Varas = 2 canónicos). Sin fusión agresiva.
- [x] **T7.** Verificación: `npm run qa` verde (catalog-client 9, puntoticket 101,
  ticketmaster 14, web 10). `--persist` real de ambas fuentes: 108 eventos
  canónicos, 108 `event_sources`, 48 `artists`, 28 `venues`, 122 `performances`.
  0 multi-fuente (catálogos disjuntos, correcto). `catalog_events_v2` recompone
  bien (`sources[]`, `performances[]`, `venue.slug`, `artists[]`).
- [x] **T8.** Estado transitorio del frontend documentado (no funcional hasta su
  brief) y contrato de `catalog_events_v2` registrado en `docs/modelo-datos.md`.
- [x] **T9.** Documentación: `docs/modelo-datos.md` actualizado con el esquema
  canónico vigente; brief con evidencia. (README y reindexado de Codebase Memory:
  pendientes menores post-merge.)

## Hallazgos y observaciones de la ejecución

- Los catálogos de PuntoTicket y Ticketmaster son **disjuntos** hoy (PuntoTicket
  concentra Santander Arena/recintos propios; Ticketmaster otros), por eso 0
  eventos multi-fuente. El matching quedará ejercitado cuando aparezca un
  concierto en ambas con el mismo venue.
- **Ticketmaster no puebla `artists`** (su JSON-LD `performer` viene vacío). Los
  48 artistas son de PuntoTicket. Mejora futura: derivar el nombre del artista
  desde el nombre del evento en el adaptador de Ticketmaster.
- El **frontend queda no funcional** hasta el brief de migración a
  `catalog_events_v2` (decisión aceptada D4=b).

## 9. Criterios de aceptación

- Dos observaciones (PuntoTicket + Ticketmaster) del **mismo** concierto pueden
  asociarse a **un** evento canónico; dos conciertos distintos **no** se fusionan.
- `Artist` y `Venue` existen como entidades con `slug` único y se relacionan con
  múltiples eventos.
- La web sigue funcionando sin cambios (contrato `CatalogEvent` intacto).
- Persistencia idempotente; re-correr el cron no duplica canónicos.
- Migraciones aplicadas y reversibles; datos existentes migrados sin pérdida.
- `npm run qa` verde; tests SQL nuevos verdes.

## 10. Pruebas

- Tests SQL (pgTAP) para: creación de entidades, backfill correcto, unicidad de
  slug, dedup conservadora (fusiona el caso claro, NO fusiona el ambiguo),
  recomposición de la vista (contrato estable).
- Tests de `scraper-core` para el mapping de persistencia canónica.
- Regresión de la web con datos canónicos (misma salida de `CatalogEvent`).

## 11. Riesgos y mitigación

- **Fusión incorrecta de eventos** → matching conservador + `needs_review` +
  tests de no-fusión (roadmap §22.2).
- **Romper el contrato del frontend** → D4=a: la vista preserva `CatalogEvent`;
  QA de regresión antes de mergear.
- **Pérdida de datos en la migración** → estrategia aditiva por fases, cada una
  reversible; backfill verificado con conteos antes/después.
- **Deriva del índice de Codebase Memory** tras el cambio estructural → reindexar
  y validar (roadmap §14).
