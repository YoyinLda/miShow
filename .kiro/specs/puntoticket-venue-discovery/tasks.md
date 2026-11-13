# Plan de Implementación: Descubrimiento de eventos por venue en PuntoTicket

## Resumen

Implementación incremental en TypeScript. Primero el core de forma aditiva y compatible (`adapter.ts`, `policy.ts`, `discovery.ts`, `orchestrator.ts`), luego el helper PRNG, el parser de venue, la fuente `fixed-list` y la fábrica del adapter en `scrapers/puntoticket`, después los flags del CLI, las propiedades y la documentación. Cada tarea es pequeña y reversible. Las decisiones pendientes de TL/PO no se resuelven aquí: se usan solo los supuestos provisionales del diseño (`fixed-list`, flag desactivado por defecto, `maxPages` = 10, `DISCOVERY_HARD_MAX_PAGES` = 25, sin persistir venue de origen, reporte en `ScrapeResult`/CLI).

Las propiedades usan un PRNG propio con semilla fija (≥ 100 iteraciones, sin `fast-check`). Cada test lleva el comentario `// Feature: puntoticket-venue-discovery, Property N: <texto>`.

## Tareas

- [x] 1. Extender el contrato del core (aditivo)
  - [x] 1.1 Agregar tipos de descubrimiento secundario en `scrapers/core/src/adapter.ts`
    - Agregar `secondaryListing?: boolean` a `AcquisitionUrlContext`
    - Definir `SecondaryDiscovery`, `SecondaryIndexSource` y `SecondaryIndexContext`
    - Agregar `readonly discovery?: SecondaryDiscovery` a `SourceAdapter`; no ampliar `AcquisitionStage`
    - Exportar los tipos desde el índice del paquete
    - _Requisitos: 10.1, 10.2, 10.3_

  - [x] 1.2 Ajustar `validateAcquisitionUrl` en `scrapers/core/src/acquisition/policy.ts`
    - En la rama `stage === "listing"`, usar `adapter.discovery?.isSecondaryPagePath` cuando `context.secondaryListing` sea verdadero; mantener `isListingPath` en caso contrario
    - Conservar la aplicación de `isBlockedPath(pathname, "listing")`
    - _Requisitos: 5.1, 5.2, 5.5, 10.4_

  - [x] 1.3 Escribir pruebas de compatibilidad de la política
    - Sin `secondaryListing` el comportamiento es idéntico al actual (adapters con y sin `discovery`)
    - Con `secondaryListing`, ruta fuera de allowlist y ruta bloqueada se rechazan
    - Las suites existentes de `core`, `puntoticket` y `ticketmaster` pasan sin modificarse
    - _Requisitos: 2.3, 10.2, 10.4_

- [ ] 2. Helper PRNG determinista para pruebas
  - [x] 2.1 Crear `scrapers/core/tests/helpers/prng.ts`
    - `createPrng(seed)` (mulberry32) con `next()`, `int(min, max)`, `pick(arr)`, `bool(p)`
    - Helper para ejecutar N iteraciones con semilla `BASE_SEED + i` e incluir `seed` e `i` en el mensaje de fallo
    - _Requisitos: 9.5 (soporte de pruebas de propiedades)_

  - [x] 2.2 Crear el espejo `scrapers/puntoticket/tests/helpers/prng.ts`
    - Misma API que en `core`
    - _Requisitos: 9.5 (soporte de pruebas de propiedades)_

- [x] 3. Lógica pura de descubrimiento en el core
  - [x] 3.1 Crear `scrapers/core/src/acquisition/discovery.ts`
    - Tipos: `DiscoveryOrigin`, `DiscoveryOptions`, `MergedReference`, `VenuePagesSummary`, `DiscoveryReport`; constante `DISCOVERY_HARD_MAX_PAGES = 25`
    - `canonicalKey` (con `canonicalSourceUrl`; `undefined` si lanza)
    - `mergeReferences`: dedupe canónico, `/musica` primero, luego exclusivas de venue en orden de índice y aparición, `origins` y `venue_pages`
    - `buildDiscoveryReport` cumpliendo los invariantes del diseño
    - `serializeReferences` (JSON estable, claves ordenadas) y `deserializeReferences` (valida forma y lanza ante entrada mal formada)
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 9.5_

  - [x] 3.2 Escribir test de propiedad para la serialización de referencias
    - **Propiedad 1: Ida y vuelta de la serialización de referencias**
    - **Valida: Requisitos 9.5**

  - [x] 3.3 Escribir test de propiedad para la canonicalización
    - **Propiedad 4: Canonicalización idempotente y estable ante variantes**
    - **Valida: Requisitos 3.5, 4.1**

  - [x] 3.4 Escribir test de propiedad para clasificación, dedupe e invariante del reporte
    - **Propiedad 5: Clasificación, deduplicación e invariante del reporte**
    - **Valida: Requisitos 3.1, 3.2, 3.3, 3.4, 3.6, 3.7**

  - [x] 3.5 Escribir test de propiedad para orden determinista y prioridad de `/musica`
    - **Propiedad 6: Orden determinista y prioridad de `/musica`**
    - **Valida: Requisitos 2.1, 3.3, 3.4, 5.9**

- [x] 4. Checkpoint - Core base
  - Ejecutar typecheck, lint y tests de `scrapers/core`. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrar el descubrimiento en el orquestador del core
  - [x] 5.1 Modificar `scrapers/core/src/acquisition/orchestrator.ts`
    - Agregar `discovery?: DiscoveryOptions` a `ScraperOptions` y `discovery?: DiscoveryReport` a `ScrapeResult`
    - Tras `parseListing`, si `enabled` y existe `adapter.discovery`: listar índice, deduplicar y recortar a `min(maxPages, DISCOVERY_HARD_MAX_PAGES)`, solicitar páginas con `{ secondaryListing: true }` vía `mapStable`, parsear con `discovery.parsePage`
    - Mapear errores: `venue_index_failed` (listing), `url_rejected`/`HttpAcquisitionError` (listing), `parse_error` (parse), con `source_url` canónica de la página
    - Unir con `mergeReferences`, calcular `VenuePagesSummary` y reporte; luego filtro de elegibles y recorte a `maxEvents`
    - Sin `discovery`, `enabled=false` o adapter sin `discovery`: mismo camino previo y sin clave `discovery` en el resultado
    - _Requisitos: 1.1, 1.4, 1.5, 1.6, 2.4, 5.8, 5.9, 8.1, 8.2, 8.3, 8.4, 8.5, 10.1, 10.2, 10.4_

  - [x] 5.2 Escribir test de propiedad para preservación sin descubrimiento
    - **Propiedad 7: Preservación del comportamiento sin descubrimiento**
    - **Valida: Requisitos 1.6, 2.1, 2.4, 10.2**

  - [x] 5.3 Escribir test de propiedad para presupuestos de solicitudes
    - **Propiedad 10: Presupuestos de solicitudes**
    - **Valida: Requisitos 5.8, 5.9**

  - [x] 5.4 Escribir test de propiedad para tolerancia a fallos parciales
    - **Propiedad 11: Tolerancia a fallos parciales y contabilidad de páginas**
    - **Valida: Requisitos 1.4, 1.5, 2.4, 6.3, 8.1, 8.2, 8.4, 8.5**

- [x] 6. Checkpoint - Core completo
  - Ejecutar typecheck, lint y tests de `scrapers/core`, `scrapers/puntoticket` y `scrapers/ticketmaster`. Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Adapter de PuntoTicket
  - [x] 7.1 Exportar helpers de `scrapers/puntoticket/src/extraction/listing.ts`
    - Exportar `EVENT_PATH`, `isEventCardLink` y `eventTitle` sin cambiar el comportamiento de `parseMusicListing`
    - _Requisitos: 2.5, 9.3_

  - [x] 7.2 Crear `scrapers/puntoticket/src/extraction/venue.ts` con `parseVenuePage(html, pageUrl)`
    - Reutilizar reglas de tarjeta de evento; resolver contra `pageUrl`
    - Emitir referencias canónicas, sin duplicados, en orden de aparición, con `title` si existe
    - Descartar host distinto, credenciales, puerto/protocolo no permitidos, rutas bloqueadas y enlaces a otras páginas de venue/listado
    - _Requisitos: 1.2, 1.3, 9.1, 9.2, 9.3, 9.4_

  - [x] 7.3 Crear la fuente `fixed-list` en `scrapers/puntoticket/src/discovery/fixed-list.ts`
    - Implementar `SecondaryIndexSource` con `kind: "fixed-list"` a partir de una lista de URLs (sin solicitudes de índice)
    - Lista vacía devuelve cero páginas; derivar la allowlist exacta de `isSecondaryPagePath` desde las URLs canónicas
    - _Requisitos: 1.1, 5.1_

  - [x] 7.4 Agregar `createPuntoticketAdapter(opts?)` en `scrapers/puntoticket/src/adapter.ts`
    - Construir el adapter con `discovery` (allowlist exacta, `parsePage = parseVenuePage`, índice inyectable) solo cuando se pasa `venueIndex`
    - Mantener `puntoticketAdapter` sin `discovery` y `isBlockedPath` sin cambios
    - _Requisitos: 2.2, 2.5, 5.5, 10.1, 10.2_

  - [x] 7.5 Extender `scrapePuntoTicket` en `scrapers/puntoticket/src/acquisition/orchestrator.ts`
    - Aceptar `discovery?: DiscoveryOptions` y un adapter opcional; delegar en `scrape` sin cambiar la firma para llamadores actuales
    - _Requisitos: 2.3, 10.1_

  - [x] 7.6 Escribir test de propiedad para render → parse de venue
    - **Propiedad 2: Ida y vuelta render → parse de la página de venue**
    - **Valida: Requisitos 1.2, 1.3, 9.1, 9.3, 9.4**

  - [x] 7.7 Escribir test de propiedad para referencias seguras
    - **Propiedad 3: El parser de venue solo emite referencias seguras**
    - **Valida: Requisitos 9.1, 9.2**

  - [x] 7.8 Escribir test de propiedad para la política de URL
    - **Propiedad 9: La política de URL impide solicitudes inválidas**
    - **Valida: Requisitos 5.1, 5.2, 5.5, 10.4**

  - [x] 7.9 Escribir test de propiedad para idempotencia de la corrida
    - **Propiedad 8: Idempotencia de la corrida**
    - **Valida: Requisitos 4.2, 4.3, 4.4, 4.6, 6.1, 6.2**

  - [x] 7.10 Escribir pruebas por ejemplo del adapter
    - Cortesía con `sleep` falso: delay ≥ 1000 ms, concurrencia ≤ 2, 429 reintentado ≤ 2
    - Rutas de `robots.txt` (`/Pago`, `/Comprar`, `/Login`, `/Categoria`, `/Seleccion`) rechazadas como venue
    - `fixed-list` con 0, 1 y N URLs y URL duplicada; página de venue sin enlaces
    - Evento solo-venue con `timezone` IANA y `starts_at` con offset; `listingUrl` por defecto y firma de `scrapePuntoTicket`
    - _Requisitos: 1.4, 2.2, 2.3, 5.3, 5.4, 5.6, 5.10, 5.11, 7.1, 7.2_

- [x] 8. CLI
  - [x] 8.1 Agregar flags en `puntoticket-scrape.ts`
    - `--venue-discovery` (desactivado por defecto), `--max-venue-pages <n>` (default 10, tope 25), `--venue-url <url>` repetible y lectura de `PUNTOTICKET_VENUE_URLS` (separada por comas)
    - Sin el flag, la salida JSON no cambia; con el flag, incluir `discovery` en el JSON
    - No alterar los flags existentes
    - _Requisitos: 1.6, 2.3, 3.6, 5.8, 6.5_

  - [x] 8.2 Escribir pruebas del CLI
    - Salida idéntica sin el flag; `discovery` presente con el flag; validación de `--max-venue-pages`
    - _Requisitos: 1.6, 2.3, 6.5_

- [x] 9. Documentación y variables
  - [x] 9.1 Actualizar `docs/`
    - Describir el flag, `PUNTOTICKET_VENUE_URLS`, la forma de `DiscoveryReport`, los supuestos provisionales y las decisiones pendientes de TL/PO
    - _Requisitos: 3.6, 6.5_

  - [x] 9.2 Documentar la variable en `.env.example`
    - Agregar `PUNTOTICKET_VENUE_URLS` vacío y comentado, sin valores reales ni secretos
    - _Requisitos: 1.1_

- [x] 10. Checkpoint final - typecheck, lint y tests
  - Ejecutar `npm run typecheck`, `npm run lint` y `npm test` (script `qa`). Ensure all tests pass, ask the user if questions arise.

## Fase 2: decisiones de TL/PO (tareas 11+)

Las tareas 1-10 están implementadas y no se modifican. La fase 2 incorpora las decisiones de TL/PO: fuente `db-venues` con tabla `venue_sources`, allowlist exacta derivada de la base, topes configurables por entorno, reporte persistido en `scrape_runs.discovery_report` y activación por `PUNTOTICKET_VENUE_DISCOVERY`. Sin cambios: categorías, pasados/agotados, 403/429, cortesía y venue de origen (no se persiste). Verificar antes de implementar la forma real del cliente de persistencia (Data API) en `scrapers/core/src/persistence/`.

- [x] 11. Migraciones de Supabase
  - [x] 11.1 Crear la migración de `venue_sources` en `supabase/migrations/`
    - Tabla `public.venue_sources` (`id` identity, `venue_id` FK `venues(id)` `on delete cascade`, `source`, `source_slug`, `source_url`, `created_at`, `updated_at`, `last_seen_at`), unique (`source`, `source_slug`), checks de no vacío y HTTPS, índice por `venue_id`
    - RLS habilitado, `revoke`/`grant` y política `venue_sources_catalog_read` coherentes con `20260913223740_canonical_events_model.sql` (lectura pública, escritura solo `service_role`)
    - Función `public.backfill_venue_sources_puntoticket()` idempotente (`on conflict (source, source_slug) do nothing`, slug validado con `^[a-z0-9]+(-[a-z0-9]+)*$`, `source_url = 'https://www.puntoticket.com/' || slug`), restringida a `service_role`, invocada desde la migración
    - Comentario en la migración con el supuesto: `venues.slug` coincide con el slug de PuntoTicket y es corregible
    - _Requisitos: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x] 11.2 Crear la migración de `scrape_runs.discovery_report`
    - Columna `jsonb` nula con check `discovery_report is null or jsonb_typeof(discovery_report) = 'object'`; sin cambios de RLS/grants
    - _Requisitos: 14.1_

  - [x] 11.3 Escribir pruebas/verificación de las migraciones
    - Verificar con ejemplos (SQL local o inspección automatizada de los archivos): constraints, RLS y grants de `venue_sources`; backfill aplicado dos veces deja las mismas filas; `discovery_report` acepta `null`/objeto y rechaza escalares
    - _Requisitos: 11.2, 11.3, 11.4, 11.7, 14.1_

- [x] 12. Topes configurables (core)
  - [x] 12.1 Reemplazar las constantes de topes en `scrapers/core/src/acquisition/discovery.ts` y `orchestrator.ts`
    - Agregar `DiscoveryLimits` y `resolveDiscoveryLimits(env, defaults)`: `maxPages` desde `PUNTOTICKET_MAX_VENUE_PAGES` (default `maxEvents`), `maxPagesLimit` desde `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT` (default `maxEventsLimit`); validar enteros, no negativos y `maxPages ≤ maxPagesLimit`
    - Eliminar `DISCOVERY_HARD_MAX_PAGES` y el default 10; el orquestador usa `min(maxPages, maxPagesLimit)`; actualizar los tests existentes que dependían de 10/25 pasando límites explícitos
    - Mantener sin cambios concurrencia ≤ 2, pausa ≥ 1000 ms y ≤ 2 reintentos; exportar desde el índice del paquete
    - _Requisitos: 5.8, 13.1, 13.2, 13.3, 13.4, 13.6_

  - [x] 12.2 Escribir test de propiedad para la resolución de topes
    - **Propiedad 14: Resolución de topes configurables**
    - **Valida: Requisitos 13.1, 13.2, 13.3, 13.4, 13.5**

- [ ] 13. Persistencia del reporte de descubrimiento
  - [x] 13.1 Extender contratos y workflow de persistencia en `scrapers/core/src/persistence/`
    - `FinishRunInput` acepta `discovery_report?: DiscoveryReport | null`; `mapping.ts` valida forma (conteos enteros ≥ 0, `missing` con URLs canónicas, sin credenciales ni fragmentos)
    - `workflow.ts` envía el reporte al cerrar la corrida (update o RPC existente, ajustando el que corresponda) y deja `null` si no hubo descubrimiento; sin romper a Ticketmaster
    - _Requisitos: 6.5, 14.2, 14.3, 14.5, 14.6, 14.7_

  - [x] 13.2 Pasar el reporte desde `scrapePuntoTicket`/CLI al persistir
    - Con `--persist`, enviar `result.discovery` a la finalización de la corrida; mantener `discovery` en `ScrapeResult` y en el JSON del CLI
    - _Requisitos: 6.5, 14.2, 14.4_

  - [x] 13.3 Escribir test de propiedad para el reporte persistido
    - **Propiedad 16: El reporte persistido hace ida y vuelta y es idempotente**
    - **Valida: Requisitos 14.2, 14.3, 14.5, 14.6, 14.7**

- [x] 14. Fuente de índice `db-venues` y allowlist exacta
  - [x] 14.1 Agregar la lectura de `venue_sources` en `scrapers/core/src/persistence/`
    - Función `listVenueSources(source)` sobre la Data API existente (`select source_slug, source_url from venue_sources where source = <source>`), con las mismas credenciales y manejo de errores del módulo
    - _Requisitos: 12.1, 12.5_

  - [x] 14.2 Crear `scrapers/puntoticket/src/discovery/db-venues.ts`
    - `buildPuntoticketVenueUrl(sourceSlug)` pura (patrón de slug, URL canónica) y `createDbVenuesIndex(loader)` con `kind: "db-venues"`, validación `source_url` ↔ `source_slug` (filas inválidas → `url_rejected`) y `allowedPaths()` exacto
    - _Requisitos: 11.5, 12.1, 12.2, 12.5, 12.6, 12.8_

  - [x] 14.3 Conectar la allowlist y la fuente en `scrapers/puntoticket/src/adapter.ts`
    - `createPuntoticketAdapter` usa la allowlist del índice (`db-venues` o `fixed-list`); `isSecondaryPagePath` acepta solo rutas exactas y respeta `isBlockedPath`; `fixed-list` queda como respaldo
    - Sin cambios en `puntoticketAdapter` ni en `parseMusicListing`
    - _Requisitos: 12.2, 12.3, 12.4, 12.7_

  - [x] 14.4 Escribir test de propiedad para URLs canónicas y allowlist = conjunto de slugs
    - **Propiedad 12: URLs derivadas de `venue_sources` son canónicas y la allowlist es el conjunto de slugs**
    - **Valida: Requisitos 11.5, 12.1, 12.2, 12.8**

  - [x] 14.5 Escribir test de propiedad para rechazo fuera de la allowlist
    - **Propiedad 13: La allowlist rechaza toda ruta fuera del conjunto**
    - **Valida: Requisitos 12.3, 12.4, 12.6**

  - [x] 14.6 Escribir pruebas por ejemplo de `db-venues`
    - 0, 1 y N filas; fila con `source_url` inconsistente; loader que falla (`venue_index_failed` y la corrida continúa con `/musica`); colisión de slug con landing; `fixed-list` como respaldo
    - _Requisitos: 12.1, 12.3, 12.5, 12.6, 12.7_

- [x] 15. Activación por entorno y CLI
  - [x] 15.1 Actualizar `scrapers/puntoticket/src/cli/puntoticket-scrape.ts`
    - `resolveVenueDiscoveryEnabled(env, flag)`: habilita con `--venue-discovery` o `PUNTOTICKET_VENUE_DISCOVERY=true`; `false`/ausente deshabilita; otro valor lanza error
    - Usar `db-venues` por defecto cuando está habilitado (la lista fija de `--venue-url`/`PUNTOTICKET_VENUE_URLS` prevalece como respaldo); resolver topes con `resolveDiscoveryLimits`; `--max-venue-pages` tiene prioridad sobre la variable; actualizar la ayuda del CLI
    - _Requisitos: 1.6, 12.7, 13.5, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 15.2 Escribir test de propiedad para la activación por entorno
    - **Propiedad 15: Activación por entorno**
    - **Valida: Requisitos 15.1, 15.2, 15.3, 15.4, 15.5**

  - [x] 15.3 Escribir pruebas del CLI de la fase 2
    - Salida idéntica a la previa sin habilitar; con env y con flag; `--max-venue-pages` sobre la variable y dentro del tope duro; variable inválida rechazada; `discovery` en el JSON
    - _Requisitos: 13.4, 13.5, 14.4, 15.2, 15.3, 15.4_

- [x] 16. Documentación y variables (fase 2)
  - [x] 16.1 Actualizar `docs/`
    - Documentar `venue_sources`, `db-venues`, el supuesto de slug derivado y su corrección, `scrape_runs.discovery_report`, las variables nuevas, el impacto en tiempo de corrida y la nota de modo estudio (evitar dañar la infraestructura del sitio); marcar resueltas las decisiones previamente pendientes
    - _Requisitos: 11.8, 16.1, 16.3_

  - [x] 16.2 Actualizar `.env.example`
    - Agregar `PUNTOTICKET_VENUE_DISCOVERY`, `PUNTOTICKET_MAX_VENUE_PAGES` y `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT` comentadas, sin valores reales ni secretos; mantener `PUNTOTICKET_VENUE_URLS` como respaldo
    - _Requisitos: 16.2_

- [x] 17. Checkpoint final de la fase 2 - typecheck, lint y tests
  - Ejecutar `npm run typecheck`, `npm run lint` y `npm test` (script `qa`). Ensure all tests pass, ask the user if questions arise.

- [x] 18. Candidatos automáticos por ticketera y estado de verificación (SQL)
  - Crear `supabase/migrations/20261009120000_venue_sources_status.sql`: columnas `status` (candidate|active|not_found) y `last_checked_at`; `ensure_venue_source_candidates(p_source)`; trigger en `venues`; RPC `record_venue_source_checks`; test de inspección. Solo archivo, sin aplicar.

- [x] 19. Estado por fuente en el scraper (TypeScript)
  - Filtrar/ordenar venues por estado, reintentar `not_found` tras N días, registrar verificaciones con `--persist`, slug por ticketera; tests, docs y `.env.example`.

## Notas

- Las tareas 1-10 están completadas y no se alteran; las tareas 11+ son la fase 2.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Los checkpoints validan de forma incremental.
- Las pruebas de propiedades validan propiedades universales; las pruebas por ejemplo cubren casos concretos. DDL, RLS y grants se verifican por ejemplo, no con PBT.
- Las migraciones solo se crean como archivos; aplicarlas en entornos remotos requiere aprobación de TL/PO.
- Sin cambios por decisión de TL/PO: categorías, eventos pasados/agotados, 403/429, cortesía y no persistir el venue de origen.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "7.1"] },
    { "id": 1, "tasks": ["1.2", "3.1", "7.2", "7.3"] },
    { "id": 2, "tasks": ["1.3", "3.2", "3.3", "3.4", "3.5", "5.1", "7.6", "7.7"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "7.4"] },
    { "id": 4, "tasks": ["7.5"] },
    { "id": 5, "tasks": ["7.8", "7.9", "7.10", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1", "9.2"] },
    { "id": 7, "tasks": ["11.1", "11.2", "12.1", "14.2"] },
    { "id": 8, "tasks": ["11.3", "12.2", "13.1", "14.3", "14.4"] },
    { "id": 9, "tasks": ["13.2", "13.3", "14.1", "14.5"] },
    { "id": 10, "tasks": ["14.6", "15.1"] },
    { "id": 11, "tasks": ["15.2", "15.3", "16.1", "16.2"] }
  ]
}
```

