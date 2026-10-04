# Brief 004 — Frontend sobre catálogo canónico (v2) + páginas de Artista y Venue

- **Estado:** Completado (2026-09-13). Frontend operativo sobre v2, verificado en
  cloud. Decisiones cerradas: D1=a (CatalogEvent
  v2 limpio), D2=a (precio combinado + botón por fuente), D3=a (rutas por slug +
  compat `?id=`), D4=a (vistas dedicadas `catalog_artists_v1`/`catalog_venues_v1`),
  D5=client-side fetch manteniendo SSG.
- **Fecha:** 2026-09-13
- **Roadmap:** V1, Etapa 2B (P0). Ver `docs/briefs/miShow_V1_definicion_roadmap.md`.
- **Rama sugerida:** `feat/frontend-v2-artist-venue`.
- **Depende de:** Brief 003 (modelo canónico) completado.

---

## 1. Contexto y problema

El brief 003 reescribió el catálogo hacia el modelo canónico y creó la vista
`catalog_events_v2`, **retirando `catalog_events_v1`**. Como consecuencia el
frontend quedó **no funcional**: `@mishow/catalog-client` y los componentes
(`EventList`, `EventCard`, `EventDetail`) todavía consultan `catalog_events_v1` y
asumen el contrato viejo (`source`/`source_url`/`purchase_url` a nivel de fila).

Objetivo de este brief (P0):

1. **Restaurar el frontend** migrándolo al contrato `catalog_events_v2`.
2. Aprovechar el modelo canónico para entregar las **páginas de Artista y Venue**
   (P0.3 y P0.4 del roadmap), que ya son posibles porque `artists`/`venues` son
   entidades con `slug`.

Los **filtros avanzados** y la **home orientada a descubrimiento** (P0.5, P0.8)
quedan para el brief 005, para mantener este acotado (anti scope-creep, §22.4).

## 2. Estado actual (verificado en código, 2026-09-13)

- `packages/catalog-client/src/client.ts`: `listEvents`, `getEvent(id)` y
  `getFreshness(source)` consultan `/rest/v1/catalog_events_v1`. `CatalogEvent`
  (en `types.ts`) tiene `source`, `source_url`, `source_code`, `purchase_url` a
  nivel raíz + `artists:[{name}]`, `venue:{name,...}`, `performances[]`.
- `apps/web` (App Router): rutas `/` (`app/page.tsx` → `EventList`) y `/evento`
  (`app/evento/page.tsx` → `EventDetail` por `?id=`). Componentes: `EventList`,
  `EventCard`, `EventDetail`; helpers `lib/format.ts`, `lib/catalog.ts`.
- `EventCard`/`EventDetail` usan `event.source_url` para el botón "Ir a la
  ticketera" y `statusLabel(event.status)`; `EventDetail` lista `performances`.
- **Contrato nuevo `catalog_events_v2`** (ya en cloud): por evento canónico
  `id, slug, name, category, subcategory, status, image_url, needs_review,
  next_performance_at, artists:[{name, slug}], venue:{slug,name,address,city,lat,lon},
  sources:[{source, source_url, purchase_url, status, price_min, price_max, currency}],
  performances:[{starts_at, timezone, status, performance_code, purchase_url}]`.
- Diferencia clave: el precio y la URL de compra ahora viven en `sources[]` (N por
  evento), no en la fila. La UI debe elegir/mostrar la(s) fuente(s).

## 3. Decisiones a validar con TL/PO

- **D1. Forma del `CatalogEvent` en `catalog-client`.**
  - (a) Actualizar `CatalogEvent` al contrato v2 (con `sources[]`, `slug`,
    `category`) y adaptar los componentes. Un solo contrato, limpio. *(recomendada)*
  - (b) Mantener `CatalogEvent` viejo y mapear v2→viejo en el cliente (menos
    cambios en UI, pero arrastra un contrato que ya no refleja el modelo).

- **D2. Precio y "ir a la ticketera" con múltiples fuentes.**
  - (a) Mostrar el **rango de precio combinado** (min de todas las fuentes, max de
    todas) y **un botón por fuente** ("Ir a PuntoTicket", "Ir a Ticketmaster")
    cuando haya más de una; si hay una sola, un botón genérico "Ir a la ticketera".
    *(recomendada)*
  - (b) Elegir una fuente primaria y ocultar el resto (más simple, pierde
    cobertura multi-fuente que es el diferenciador).

- **D3. Navegación y rutas.**
  - (a) Introducir rutas por **slug**: `/evento/{slug}`, `/artistas/{slug}`,
    `/venues/{slug}`, además de mantener `/evento?id=` por compatibilidad de
    enlaces existentes. *(recomendada; SEO-friendly, alineado al roadmap P1.5)*
  - (b) Seguir usando `?id=` en todo (más simple, peor para SEO/futuras páginas).

- **D4. Fuente de datos para Artista/Venue.**
  - (a) Consultar directamente las tablas `artists`/`venues` + derivar sus eventos
    desde `catalog_events_v2` filtrando por slug de artista/venue. Requiere exponer
    lectura de esas tablas (ya tienen RLS de solo lectura) o vistas dedicadas
    `catalog_artist_v1` / `catalog_venue_v1`. *(recomendada: vistas dedicadas,
    contrato estable para el cliente)*
  - (b) Solo derivar desde `catalog_events_v2` en el cliente (sin vistas nuevas);
    más simple pero mete lógica de agregación en el frontend.

- **D5. Estado del SSG con datos dinámicos.**
  - El sitio es export estático (SSG) y hoy lee en el navegador. Las páginas de
    artista/venue por slug pueden resolverse **client-side** (fetch por slug) sin
    romper el export. Confirmar que se mantiene SSG en V1 (SSR/ISR es P2).
    Recomendado: **client-side fetch, SSG intacto**.

## 4. Solución propuesta (diseño)

1. **`catalog-client`:** actualizar `CatalogEvent` al contrato v2; `listEvents`/
   `getEvent` apuntan a `catalog_events_v2`. Agregar `getEventBySlug(slug)`,
   `getArtistBySlug(slug)` + `listEventsByArtist(slug)`, `getVenueBySlug(slug)` +
   `listEventsByVenue(slug)`. Nuevos tipos `CatalogArtistPage`, `CatalogVenuePage`.
2. **Vistas SQL dedicadas** (D4=a): `catalog_artists_v1` y `catalog_venues_v1`
   (datos de la entidad + sus próximos eventos), con RLS de solo lectura. Migración
   aditiva y reversible.
3. **Componentes web:**
   - `EventCard`/`EventDetail`: leer precio/estado/compra desde `sources[]`;
     botón(es) a la ticketera según D2; enlazar a `/evento/{slug}`.
   - Nuevas rutas `/artistas/[slug]` y `/venues/[slug]` con sus componentes
     (nombre, imagen, próximos eventos, enlaces externos, mapa/ubicación si hay).
   - Enlaces cruzados: en el detalle de evento, artista y venue enlazan a sus
     páginas.
4. **`format.ts`:** helper de precio combinado desde `sources[]`.
5. Mantener SSG (D5): fetch client-side por slug.

## 5. Fuera de alcance (de este brief)

- Filtros avanzados de catálogo y atajos "Hoy/Fin de semana" (brief 005).
- Home orientada a descubrimiento y sección "Escena local" (briefs 005/006).
- Auth, tocatas, comunidad, moderación (briefs 006+).
- SSR/ISR (P2). Deduplicación adicional (ya cubierta en 003).

## 6. Checklist de tareas

> `[ ]` pendiente · `[x]` hecho.

- [x] **T1.** Decisiones cerradas: D1=a, D2=a, D3=a, D4=a, D5=client-side/SSG.
- [x] **T2/T4.** `catalog-client`: `CatalogEvent` v2 + tipos (`CatalogEventSource`,
  `CatalogArtist`, `CatalogVenue`, `CatalogEventBrief`). `listEvents`/`getEvent`/
  `getEventBySlug` → `catalog_events_v2`; `getArtistBySlug` → `catalog_artists_v1`;
  `getVenueBySlug` → `catalog_venues_v1`. 12 tests verdes.
- [x] **T3.** Migración `20260914194335_artist_venue_views` (vistas
  `catalog_artists_v1`/`catalog_venues_v1` con próximos eventos, RLS de solo
  lectura). Aplicada en cloud y verificada.
- [x] **T5.** Web: `EventCard`/`EventDetail` al contrato v2 (precio combinado y
  compra desde `sources[]`; botón único o por fuente; enlaces por slug). `EventList`
  sin cambios (su filtro usa campos que persisten).
- [x] **T6.** Rutas `/evento?slug=`, `/artistas?slug=`, `/venues?slug=` (query
  param por SSG) con `ArtistDetail`/`VenueDetail` y enlaces cruzados desde el
  detalle de evento.
- [x] **T7.** `npm run qa` verde (catalog-client 12, puntoticket 101, ticketmaster
  14, web 16); build estático OK (5 rutas Static); prueba manual contra cloud con
  la clave publishable (events_v2, artists_v1, venues_v1 responden).
- [x] **T8.** Documentación: `docs/modelo-datos.md` (vistas nuevas + frontend
  operativo), este brief con evidencia; nota de "frontend no funcional" retirada.
- [x] **T9.** Integración con `main` (merge de `main` en la rama, sin rebase;
  único conflicto en el índice de briefs, resuelto conservando ambas filas 004) +
  docs v1→v2 (despliegue, prueba e2e, cron, persistencia). Verificación
  2026-10-04: `npm ci` + `npm run qa` verde (catalog-client 12, puntoticket 101,
  ticketmaster 14, web 16); build estático con `/`, `/evento`, `/artistas`,
  `/venues`, `/_not-found` (sin `sb_secret` en `out/`). Cloud con clave
  publishable: `catalog_events_v2` 142 filas, `catalog_artists_v1` 64,
  `catalog_venues_v1` 35; las 7 formas de request del cliente (listar, por id, por
  slug, búsqueda `ilike`, artista, venue, RPC frescura) → HTTP 200;
  `catalog_events_v1` → 404. Headless (Brave vía playwright-core, 390×844): home
  con 100 tarjetas y frescura; detalle, artista (1 próximo evento) y venue
  Santander Arena (41 próximos) con datos; slug inexistente → "No se encontró el
  artista". Consola sin errores salvo un 404 de `/favicon.ico` (el sitio no tiene
  favicon; preexistente).

## Notas de la ejecución

- **SSG y rutas por slug:** con `output: "export"` no se pueden usar segmentos
  dinámicos `[slug]` sin `generateStaticParams`. Se resolvió con **query param**
  (`?slug=`), que mantiene una página estática por ruta y resuelve el slug
  client-side. La decisión D3 (rutas por slug) se cumple con esta forma;
  migrar a segmentos limpios `/evento/{slug}` es trivial si en el futuro se pasa
  a SSR/ISR.
- **Multi-fuente en la UI:** el detalle muestra "Disponible en" con un botón por
  ticketera cuando hay varias; con una sola, botón genérico "Ir a la ticketera".
- El frontend vuelve a estar **operativo** sobre el modelo canónico.

## 7. Criterios de aceptación

- El listado y el detalle vuelven a funcionar leyendo `catalog_events_v2`.
- Un evento con varias fuentes muestra su cobertura multi-fuente (precio combinado
  + acceso a cada ticketera) según D2.
- `/artistas/{slug}` y `/venues/{slug}` renderizan la entidad y sus próximos
  eventos, con enlaces cruzados desde el detalle.
- Se mantiene el principio de información honesta (campos ausentes se omiten o se
  indican amablemente; no se inventan precios).
- `npm run qa` verde y build estático OK; navegación usable en mobile.

## 8. Pruebas

- `catalog-client`: tests con fetch mock para v2 y para artista/venue.
- Tests SQL (pgTAP) de las vistas nuevas.
- Verificación manual con los datos reales ya persistidos (108 eventos, 48
  artistas, 28 venues).

## 9. Riesgos y mitigación

- **Contrato v2 desalineado con la UI** → actualizar `CatalogEvent` y cubrir con
  tests del cliente antes de tocar componentes.
- **Slugs con colisión** → ya resuelto en 003 (`mishow_unique_slug`); el cliente
  usa el slug tal cual viene de la vista.
- **SSG + datos dinámicos** → fetch client-side por slug; no romper el export.
- **Eventos sin artista (Ticketmaster)** → la página de artista solo lista los que
  existen; el detalle de evento tolera `artists: []` sin romper.
