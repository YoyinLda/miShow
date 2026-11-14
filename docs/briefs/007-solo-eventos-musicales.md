# Brief 007 — Solo eventos musicales en el catálogo

Estado: completado y desplegado (2026-11-14). Migración `20261114120000` aplicada en producción.

## Problema

PuntoTicket descubre eventos desde `/musica` y, desde el brief de venue discovery, también desde las páginas de cada recinto. Esas páginas listan todo lo que ocurre en el recinto, así que entraron partidos de fútbol (p. ej. Claro Arena). `events.category` valía siempre `'musica'` por defecto y la página de detalle no expone la categoría (su JSON-LD es `Event`). Ticketmaster no está afectado: solo descubre desde `/page/musica`.

## Decisiones TL/PO (2026-11-14)

- **Detección:** se usan los listados de la propia fuente, `/deportes`, `/teatro` y `/familia`. No se usa una heurística por nombre.
- **Acción:** los eventos no musicales se guardan con su categoría real y las vistas públicas muestran solo `musica`. No se descartan en la ingesta.

## Regla de clasificación (`classifyMerged`, `scrapers/core`)

| Cómo llegó el evento | Categoría |
|---|---|
| Visto en `/musica` (aunque también esté en otra categoría) | `musica` |
| Solo por venue y presente en un listado de categoría | esa categoría |
| Solo por venue, ausente de los listados y todos se leyeron bien | `musica` |
| Solo por venue, ausente y algún listado falló | sin categoría (la base conserva la vigente) |

Los listados de categoría se leen solo si hay eventos que llegaron únicamente por venue: son 3 solicitudes más por corrida, con la misma concurrencia, delay y reintentos. La política exige que la solicitud venga marcada como `categoryListing` y que la ruta esté declarada en `discovery.categoryListings`; el resto de `/deportes` sigue bloqueado.

## Cambios

- `NormalizedEvent.category?` (dominio) → payload de `persist_normalized_event` (validado `^[a-z]+$`).
- Migración `20261114120000_events_music_only.sql`:
  - `persist_normalized_event` escribe `category`: al crear usa la del payload o `musica`; al actualizar solo la reemplaza si viene en el payload.
  - `catalog_events_v2`, `catalog_artists_v1` y `catalog_venues_v1` filtran por `category = 'musica'`. Se ocultan los artistas que solo aparecen en eventos no musicales.
  - Reclasifica como `deportes` los 2 partidos detectados.
- Tests: `scrapers/core/tests/category-classification.test.ts` y pgTAP `supabase/tests/database/events_music_only.test.sql`.

## Verificación

- Typecheck, lint y tests de core, puntoticket, web, catalog-client y domain: OK.
- `/deportes` real: el parser de listados extrae 27 eventos, entre ellos los 2 partidos del catálogo.
- No verificado localmente: la migración y el test pgTAP (en este equipo no hay Docker para `supabase start`). Hay que correr `npm run supabase:test` antes del `db push`.

## Fuera de alcance

- Ticketmaster (no presenta el problema).
- Eventos no musicales que la fuente no liste en `/deportes`, `/teatro` ni `/familia`: requerirían otra señal, por ejemplo la heurística por nombre que se descartó.
