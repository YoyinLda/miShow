# Front: Home (/) y Catálogo (/eventos)

Rediseño de la Etapa 4 (frames Figma `03 Screens`: Home 3:123/3:2 y Catálogo
10:332/10:175). Documenta el routing, qué secciones usan dato real vs estructura
sin datos, la extensión `range` del cliente y la preparación para datos futuros.

## Routing: Home vs Catálogo

Dos rutas, con responsabilidades distintas:

- **Home (`/`)** — descubrimiento. Hero editorial + chips de rango + Destacados +
  Próximos conciertos (avance corto) + enlace "Ver todos los eventos" + Escena
  local + Historias. El buscador del hero y del header navegan a `/eventos?q=`.
- **Catálogo (`/eventos`)** — listado completo. Título "Explora eventos" +
  buscador + chips + "Todos los eventos" + lista con scroll infinito.

Por qué dos rutas: la Home prioriza descubrimiento curado (pocos ítems, varias
secciones); el Catálogo prioriza exploración exhaustiva (una lista larga con
paginación keyset). Separarlas evita montar el listado pesado en la portada y
deja la búsqueda server-side con scroll infinito en un solo lugar.

El componente `components/EventList.tsx` (listado completo con scroll infinito,
búsqueda server-side y restauración por snapshot) vive en `/eventos`. La Home
usa `UpcomingSection` para un avance corto, no el listado completo.

## Dato real vs estructura sin datos

Mapeo según la realidad del catálogo (`catalog_events_v2`; ver
`docs/modelo-datos.md` y `data_reality` del contexto de la tarea):

| Sección | Fuente | Estado hoy |
|---|---|---|
| Catálogo `/eventos` | `listEvents` (keyset + search + range) | **Dato real** |
| Destacados (Home) | `listEvents` + `selectFeatured` (cercanía) | **Dato real** (fallback por cercanía, no hay campo "destacado") |
| Próximos conciertos (Home) | `listEvents` orden por `next_performance_at` | **Dato real** |
| Chip "Gratis" | post-filtro cliente `isFree` (price_min=0) | **Vacío honesto** (0/143 eventos gratis hoy) |
| Escena local | — | **Sin datos** (placeholder honesto) |
| Historias | — | **Sin datos** (placeholder honesto) |

No se inventan datos: donde no hay respaldo, se muestra un placeholder
("Próximamente") o un estado vacío honesto, nunca contenido ficticio. El rótulo
"Datos de ejemplo" de los frames Figma es placeholder de diseño y NO se usa en
la UI real.

## Extensión `range` del CatalogClient

`listEvents({ range })` filtra por `next_performance_at` (columna top-level
`timestamptz`) con `range: { gteISO?, lteISO? }` traducido a PostgREST
`next_performance_at=gte.<…>&=lte.<…>` en las queries de datos y de conteo. Con
`range` activo se fuerza la fase A (nonnull) para no mezclar la zona de fechas
NULL. Sin `range`, la request es byte-idéntica a la histórica (retrocompatible).

Los chips se traducen así (helpers puros en `lib/discovery.ts`, zona
America/Santiago):

- `hoy` / `semana` / `mes` → `dateRange(kind)` → `listEvents({ range })`
  (server-side). Cambiar de chip resetea el listado (scroll al tope, nuevo
  cursor), igual que un cambio de término.
- `gratis` → **NO** es filtro server-side: `price_min` vive en `sources` (jsonb)
  y no es filtrable server-side de forma simple. Se aplica como **post-filtro
  cliente** con `isFree(sources)` sobre lo ya cargado. Como hoy no existen
  eventos con `price_min=0`, el resultado es un estado vacío honesto ("No hay
  eventos gratuitos por ahora.").

El chip activo se refleja en `?rango=` con `history.replaceState` (sin recargar
ni crear entradas de historial). El término de búsqueda se refleja en `?q=`.

## Filtros avanzados (Etapa 5)

`/eventos` suma filtros de faceta **server-side** sobre `catalog_events_v2`, sin
tocar la base (ver `.agents/tasks/miShow-feat-etapa5-filtros-2026-10-04/`). Tres
facetas viables confirmadas en Fase 1:

| Faceta | UI | Traducción PostgREST |
|---|---|---|
| **Fuente** | Ticketmaster / PuntoTicket | `sources=cs.[{"source":"<code>"}]` (solo con 1 valor efectivo; 0 o ambas = sin filtro) |
| **Lugar** (ciudad) | `venue.city` | `venue->>city=in.("Ciudad A","Ciudad B")` |
| **Estado** | Disponible / Agotado | `status=in.(available,sold_out)` |

Reglas de composición:

- AND entre facetas, OR dentro de cada faceta. Ninguna faceta añade un segundo
  `or=`, así que el único `or=` top-level sigue siendo el del keyset: componen
  limpio con `?q=` (`name=ilike`), `?rango=` (`next_performance_at` gte/lte) y la
  paginación en dos fases.
- Los filtros se aplican en la query de DATOS **y** en la de CONTEO
  (`Prefer: count=exact`), de modo que el total ("37 eventos") refleja la
  combinación activa.
- Sin filtros, la request es byte-idéntica a la histórica (retrocompatible; hay
  test de byte-identidad en `packages/catalog-client/tests/client.test.ts`).

Contrato del cliente: `listEvents({ filters: { sources?, cities?, statuses? } })`
(`ListEventsFilters` en `@mishow/catalog-client`). Un arreglo vacío equivale a la
clave ausente.

Rótulo de UI: la sección de ciudad se rotula **"Lugar"**; los identificadores
internos (`venue`, tipo `CatalogVenue`, ruta `/venues`, `venue.*`) NO cambian.

UI y accesibilidad:

- Botón "Filtros" junto al buscador con contador de filtros activos; abre un
  **bottom sheet** accesible (`role="dialog"`, `aria-modal`, foco atrapado,
  cierre con Esc y overlay, restaura el foco al disparador). Pills con
  `aria-checked`, área táctil ≥44px, foco visible, contraste AA en claro y
  oscuro. Patrón de borrador: "Aplicar" confirma, "Limpiar" vacía el borrador.
- Sobre la lista: chips de filtros activos con "quitar" individual + "Limpiar
  todo"; el conteo total se anuncia con `aria-live`.
- Estado vacío honesto ("Sin resultados para estos filtros" + acción de limpiar).
- Cambiar cualquier filtro resetea el scroll y re-consulta (nuevo cursor).

URL (helpers puros en `lib/filters.ts`, con tests en `tests/filters.test.ts`):
`?fuente=ticketmaster&ciudad=Santiago%20Centro&estado=sold_out`, combinable con
`?q=` y `?rango=`, reflejada con `history.replaceState` (sin recargar ni crear
historial). Recargar restaura los filtros. Multi-valor por CSV o parámetro
repetido; se serializa un CSV por faceta y se omiten las vacías.

Catálogo de ciudades del sheet: se **deriva de los eventos ya cargados** (más las
ciudades seleccionadas vía URL), sin endpoint nuevo ni lista hardcodeada; se
ordena alfabéticamente (es-CL).

El chip **"Gratis"** sigue como estaba (post-filtro cliente `isFree`, vacío
honesto); NO se convirtió en server-side.

## Preservación del listado

En `/eventos` se conservan intactos del listado previo:

- scroll infinito con `IntersectionObserver` + botón "Cargar más";
- búsqueda server-side con debounce;
- estados carga/error/vacío;
- restauración por snapshot al volver del detalle (clave de sessionStorage
  renombrada a `mishow:eventos:snapshot`);
- el contrato puro de `lib/event-list-state.ts` (sin cambios; tests verdes).

## Tokens alineados al Figma

Los tokens de color/espaciado se alinearon al Figma Foundations en
`apps/web/app/globals.css` (ver `docs/front-tokens-tema.md` para la estrategia
de override claro/oscuro). Tokens oscuros clave: `--bg #0C0C0F`,
`--surface #15151A`, `--surface-event #121218`, `--border #292932`,
`--chip-border #3A3A46`, `--brand #8B5CF6`, `--accent #FACC15` (badge, par con
`--accent-contrast #18181B`, ~13.9:1 AA/AAA). La tipografía es Geist cargada con
`next/font/local` (compatible con `output: 'export'`).

## Preparación para datos futuros

Estructura lista; esperan dato de origen que hoy no existe:

- **Gratis** — cuando una fuente exponga `price_min = 0`, los eventos gratis
  deben quedar **claramente marcados como gratis** (badge con el par
  `accent`/`accent-contrast`). El post-filtro `isFree` ya detecta el caso.
- **Destacados** — hoy es fallback por cercanía (`selectFeatured`). Hay un hook
  `isFeatured(event) => false` como punto de extensión para un campo "destacado"
  real; los destacados también deben quedar claramente marcados.
- **Escena local** — a futuro **solo bandas chilenas / under**. Requiere un dato
  de origen confiable (género/procedencia) que hoy no existe (`subcategory` es
  null en 143/143). Queda sin datos; NO se inventan bandas.
- **Historias** — contenido editorial futuro. Queda sin datos; NO se inventan
  artículos.
