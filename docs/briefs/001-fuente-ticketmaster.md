# Brief 001 — Segunda fuente: Ticketmaster + arquitectura multi-fuente

- **Estado:** Completado (10/10). Decisiones D1–D5 cerradas con las opciones recomendadas (2026-09-13).
  - D1=a (núcleo `@mishow/scraper-core` + adaptadores por fuente).
  - D2=a (`SourceAdapter`; `source` pasa a `string` validado contra `sources`).
  - D3=a (host y rutas parametrizados en `@mishow/domain`, defaults PuntoTicket).
  - D4=a (un workflow de cron por fuente).
  - D5 (mapeo de disponibilidad Ticketmaster con regla "Confirmado por defecto").
  - Nota técnica: el scraper corre con `tsx` sobre TS fuente (sin build a JS);
    `@mishow/domain` se consume por `paths`. El split no agrega pasos de build.
- **Fecha:** 2026-09-13
- **Alcance:** agregar Ticketmaster Chile como segunda fuente de eventos de
  música y dejar la estructura de scraping preparada para N fuentes, antes de
  desplegar el sistema.

---

## 1. Contexto y problema

Hoy el scraping es exclusivo de PuntoTicket: existe un solo paquete
`@mishow/scraper-puntoticket` y el `source` está fijo en `"puntoticket"` a lo
largo de tipos, normalización, persistencia y CLI. Queremos incorporar
**Ticketmaster** (`https://www.ticketmaster.cl/page/musica`) como segunda fuente
y definir cómo conviven varias fuentes (mismo cron o crons separados) siguiendo
buenas prácticas, sin romper lo existente.

## 2. Investigación (verificada con curl, 2026-09-13)

Todas las peticiones respondieron **HTTP 200 sin cookies ni headers especiales**,
solo con un User-Agent de navegador. Igual que en PuntoTicket, el listado carga
la totalidad de los eventos en el HTML inicial (la paginación es cosmética).

### 2.1 Listado `https://www.ticketmaster.cl/page/musica`
- ~232 KB, **66 slugs `/event/<slug>` únicos** en el HTML server-rendered.
- Estructura de tarjeta:
  ```html
  <div role="listitem" class="grid_element">
    <a href='../event/akriila-2026'>
      <span class='grid-label'>Centro Cultural Estación ...</span>
      ... <div class="item_title">Bersuit - 25 Años ...</div>
      <p>12 de Diciembre 2025</p> ...
    </a>
  </div>
  ```
- Enlaces **relativos con `../`** y **comillas simples**; algunos slugs llevan
  prefijo numérico (`/event/813-inti-illimani-...`).
- Título en `.item_title`, fecha en `<p>` dentro de `.details`, recinto en
  `.grid-label`.

### 2.2 Detalle `https://www.ticketmaster.cl/event/<slug>`
- ~165 KB. **Trae JSON-LD `schema.org/Event`** — el mismo formato que ya parsea
  el extractor de PuntoTicket:
  ```json
  {"@type":"Event","name":"Robbie Williams - Britpop World Tour",
   "location":{"@type":"Place","name":"Estadio Bicentenario La Florida",
     "address":{"streetAddress":"...","addressLocality":"La Florida"}},
   "offers":[],"performer":[],
   "description":"27 de Septiembre 2026",
   "url":"https://www.ticketmaster.cl/event/robbie-williams-2026"}
  ```
- En el ejemplo `offers`/`performer` vienen vacíos y hay un `var result=[]`
  embebido (funciones por fecha, vacío en ese evento). La **fecha** puede venir
  en `description` ("27 de Septiembre 2026") y/o en `startDate` cuando exista.
- Hay marcadores de compra (`ticket-shop`, `show-button`) que habrá que mapear a
  la señal de disponibilidad.

### 2.3 Estado del código actual (acoplamiento a PuntoTicket)
- `source: "puntoticket"` está **hardcodeado** en los tipos: `NormalizedEvent`,
  `PuntoticketScrapeResult`, `StartRunInput`, `PersistedEventPayload`.
- `@mishow/domain` fija el host `www.puntoticket.com` en `canonicalSourceUrl` y
  `allowedPurchaseUrl`, y rutas específicas de PuntoTicket
  (`/queue/enqueue/...`, `/comprar/evento/.../cal/...`).
- La política de adquisición (`policy.ts`) valida host y rutas de PuntoTicket.
- **DB (buena noticia):** el modelo ya es multi-fuente. Existe tabla `sources`
  genérica (`code`, `name`, `base_url`) y `events.source_id` (FK). El único punto
  acoplado es la RPC `upsert_scrape_events`, que al insertar el source hardcodea
  `'PuntoTicket', 'https://www.puntoticket.com'`.
- El frontend ya muestra `event.source` y `source_url` de forma genérica (el
  botón "Ir a la ticketera" usa `source_url`, sin nombrar la fuente).

**Conclusión:** el detalle de Ticketmaster es compatible con el extractor JSON-LD
existente; el mayor trabajo es (a) desacoplar `source`/host/rutas del núcleo y
(b) un adaptador de listado propio de Ticketmaster.

## 3. Decisiones a validar con TL/PO

Estas son decisiones de arquitectura/costo (según AGENTS.md las cierra TL/PO).
El brief propone una opción recomendada por cada una; **confirmar antes de ejecutar**.

- **D1. Estructura de paquetes.**
  - (a) **Núcleo compartido `@mishow/scraper-core`** + paquetes finos por fuente
    (`scraper-puntoticket`, `scraper-ticketmaster`) que aportan solo su adaptador
    de listado/detalle y su config de host/rutas. *(recomendada)*
  - (b) Un paquete `@mishow/scrapers` con subcarpetas por fuente.
  - (c) Duplicar el paquete actual para Ticketmaster (más simple, más deuda).

- **D2. Abstracción de `source` y host/rutas.**
  - (a) Introducir un **`SourceAdapter`** (identidad `source`, `base_url`,
    validación de URL/rutas, parser de listado, parser de detalle) y hacer
    genéricos `EventStatus`/`NormalizedEvent` respecto a `source: string`
    (validado contra la tabla `sources`). *(recomendada)*
  - (b) Mantener uniones literales y ampliarlas a `"puntoticket" | "ticketmaster"`.

- **D3. Validación de URL en `@mishow/domain`.**
  - (a) Parametrizar host y rutas permitidas por adaptador (cada fuente declara su
    host y sus patrones de `purchase_url`). *(recomendada)*
  - (b) Añadir Ticketmaster con funciones separadas específicas.

- **D4. Orquestación del cron.**
  - (a) **Un workflow por fuente** (matriz o archivos separados), con su propio
    horario, límites y `concurrency` group. Aísla fallos y facilita ritmos
    distintos. *(recomendada)*
  - (b) Un solo workflow que recorre ambas fuentes secuencialmente.
  - Nota: la persistencia ya es idempotente y por `source_id`, así que ambas
    opciones son seguras a nivel datos.

- **D5. Disponibilidad/estado en Ticketmaster.**
  - Confirmar el mapeo de señales (`ticket-shop`/`show-button`, `offers`,
    fecha en `description`) a `available/sold_out/upcoming/unknown`, respetando la
    regla ya acordada: **por defecto "Confirmado" (unknown) salvo evidencia**.

## 4. Solución propuesta (diseño)

Trabajo incremental, sin romper PuntoTicket:

1. **Extraer núcleo** (`@mishow/scraper-core`): orquestador, cliente HTTP,
   política genérica, normalización y persistencia, parametrizados por un
   `SourceAdapter`.
2. **Definir `SourceAdapter`:**
   ```ts
   interface SourceAdapter {
     source: string;                 // "puntoticket" | "ticketmaster" | ...
     name: string;                   // "PuntoTicket" | "Ticketmaster"
     baseUrl: string;                // https://www.puntoticket.com | https://www.ticketmaster.cl
     listingUrl: string;             // /musica | /page/musica
     isEventUrl(url): boolean;       // rutas de evento por fuente
     allowedPurchaseUrl(url): ...;   // patrones de compra por fuente
     parseListing(html, base): RawEventReference[];
     parseDetail(html, url): RawEventDetail;   // reutiliza JSON-LD común
   }
   ```
3. **Adaptar PuntoTicket** al núcleo (mover su listing/detail/policy a su adapter),
   preservando su comportamiento y tests actuales.
4. **Crear adaptador Ticketmaster:**
   - Listado: seleccionar `div.grid_element > a[href*="/event/"]`, resolver
     rutas relativas `../event/<slug>` contra la base, dedupe, título de
     `.item_title`/`.grid-label`.
   - Detalle: reutilizar el parser JSON-LD `schema.org/Event`; complementar fecha
     desde `description` cuando no haya `startDate`; mapear señales de compra a
     estado.
   - Host/rutas: `www.ticketmaster.cl`, rutas `/event/...`.
5. **Genéricos de dominio:** `canonicalSourceUrl(value, { host })` y
   `allowedPurchaseUrl(value, base, { host, patterns })` parametrizados; los
   defaults de PuntoTicket se preservan.
6. **Persistencia:** en la RPC `upsert_scrape_events`, tomar `name`/`base_url`
   del payload del `source` (o de un catálogo de fuentes) en vez de literales
   `'PuntoTicket'`. Migración nueva, aditiva y reversible.
7. **CLI y cron:** un CLI por fuente (o uno con `--source`), y workflow(s) según
   D4. Reutilizar límites por env (`MAX_EVENTS`, `MAX_EVENTS_LIMIT`).
8. **Frontend:** ya es genérico; validar que el listado combine fuentes y que el
   indicador de frescura funcione por fuente (RPC `catalog_freshness_v1` acepta
   `p_source`).

## 5. Checklist de tareas

> Estado: `[ ]` pendiente · `[x]` hecho. Marcar al ejecutar cada tarea y anotar evidencia.

- [ ] **T1.** Cerrar decisiones D1–D5 con TL/PO y registrar la elección aquí.
- [x] **T2.** Extraer `@mishow/scraper-core` parametrizado por `SourceAdapter`.
  **Hecho:** core con http/orchestrator/policy/normalization/persistence/jsonld
  genéricos; PuntoTicket quedó como adaptador fino con wrappers que preservan las
  firmas históricas. Tests de PuntoTicket 101/101 sin cambiar aserciones.
- [x] **T3.** Parametrizar `@mishow/domain` (host y rutas por fuente) preservando
  defaults de PuntoTicket. **Hecho:** `canonicalSourceUrl`/`allowedPurchaseUrl`
  aceptan `SourceUrlOptions { host, purchasePathPatterns }` con defaults
  PuntoTicket; `NormalizedEvent.source` pasó de literal a `string`. Typecheck y
  tests de todos los workspaces verdes (sin regresiones).
- [x] **T4.** Adaptador **Ticketmaster** listado (`grid_element`, `../event/<slug>`,
  dedupe, título `.item_title`/alt/title, recinto `.grid-label`) + tests con fixture.
- [x] **T5.** Detalle Ticketmaster: reutiliza parser JSON-LD del core, fecha desde
  `description` "DD de Mes YYYY", estado con regla "Confirmado por defecto"
  (`purchasePathPatterns: []`, sin URL de compra seguible). Tests con fixture.
- [x] **T6.** Persistencia multi-fuente: migración `20260913200727_multi_source_start_run.sql`
  (`create or replace start_scrape_run` que toma `source_name`/`source_base_url` del
  payload con fallback a PuntoTicket, aditiva y reversible). Aplicada en Supabase cloud;
  repo y cloud alineados. El core ya envía esos campos en el payload.
- [x] **T7.** CLI `ticketmaster:*` + workflow `.github/workflows/scrape-ticketmaster.yml`
  (independiente, horarios desfasados 13:00/23:00 UTC), límites por env, concurrency 2,
  delay 1500ms, timeout 20 min.
- [x] **T8.** Verificación integral: `npm run qa` verde (todos los workspaces;
  PuntoTicket 101, Ticketmaster 11, web 10). Prueba `--live` real de Ticketmaster
  (`MAX_EVENTS=3`, sin persist): **discovered=61**, succeeded 3/3, failed 0, nombres
  correctos desde JSON-LD, `source: ticketmaster`.
- [x] **T9.** Prueba `--persist` total contra Supabase cloud: run_id 6, status
  succeeded, discovered 61 / attempted 60 / succeeded 60 / failed 0. En cloud
  conviven `puntoticket` (48) y `ticketmaster` (60, base_url correcta). La vista
  `catalog_events_v1` (fuente del frontend) devuelve ambas combinadas (108).
- [x] **T10.** Documentación: README actualizado (monorepo multi-fuente, árbol
  `scrapers/{core,puntoticket,ticketmaster}`, próximos pasos), brief con evidencia
  y anexo de diseño del `SourceAdapter`.

## 6. Verificación (definición de terminado)

- `npm run typecheck`, `npm run lint`, `npm test` (o `npm run qa`) verdes.
- Tests de PuntoTicket **sin regresiones**.
- Nuevos tests de Ticketmaster (listado + detalle) con fixtures reales, deterministas y sin red.
- Prueba live acotada de Ticketmaster: `discovered ≈ 66`, al menos 1 detalle
  extraído y normalizado correctamente.
- Migración SQL aplicada y probada; persistencia idempotente por `source_id`.
- Sin secretos, sin cookies, sin seguir `purchase_url`, respetando límites de la fuente.
- `docs/` actualizado y diff claro.

## 7. Notas y restricciones

- No ejecutar JavaScript de la fuente: todo sale del HTML server-rendered.
- Respetar la regla de scraping: mínimo de requests (1 al listado + 1 por detalle),
  throttling (`concurrency` ≤ 2, `delay` configurable), sin evadir bloqueos.
- Zona horaria explícita (America/Santiago) en fechas, igual que PuntoTicket.
- Detección de duplicados **entre fuentes** (mismo evento en PuntoTicket y
  Ticketmaster) queda como trabajo futuro salvo que TL/PO lo incluya aquí (ver D5
  ampliable); por ahora cada fuente conserva su `source_url` original.
