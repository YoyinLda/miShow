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
