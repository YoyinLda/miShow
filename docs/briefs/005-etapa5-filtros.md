# Brief 005 · Etapa 5 — Filtros avanzados del catálogo

> Estado: **propuesta** (pendiente de aprobación TL/PO). Mobile-first.
> Alcance: `apps/web` (vista `/eventos`), `@mishow/catalog-client`. Sin cambios de
> base de datos. Cierra el Obj.5 del brief 005.

## 1. Contexto

Las Etapas 1-4 están en producción. La Etapa 4 ya entregó, en `/eventos`:

- búsqueda server-side (`?q=`) con scroll infinito (keyset),
- chips de **rango de fecha** Hoy / Semana / Mes (filtro server-side por
  `next_performance_at`) y **Gratis** (post-filtro cliente, hoy vacío honesto).

Lo que falta del Obj.5 original es un panel de **filtros avanzados** por faceta,
combinables, para afinar la exploración más allá del texto y la fecha. Este brief
cubre solo eso; no reintroduce lo ya hecho.

## 2. Investigación — datos reales (verificados en cloud, 2026-10-04)

Consulta read-only sobre `catalog_events_v2` (143 eventos; 127 con fecha futura):

| Faceta | Datos | ¿Viable? |
|---|---|---|
| **Fuente** | ticketmaster 78 · puntoticket 65 | **Sí** (2 valores, estable) |
| **Ciudad** | 20 ciudades; top: Santiago Centro 51, Mostazal 20, Providencia 16, La Florida 7, Puerto Varas 6, Ñuñoa 6, Concepción 6, Santiago 5 | **Sí** (desde `venue.city`) |
| **Recinto** | 35 venues distintos (`venue.name`) | **Sí**, pero muchos (mejor como búsqueda/typeahead que como lista de chips) |
| **Estado** | unknown 121 · sold_out 17 · available 4 · upcoming 1 | **Parcial**: el 85 % es `unknown`. Coherente con la decisión vigente ("unknown ⇒ Confirmado"), exponer solo `available`/`sold_out` tiene poco volumen |
| **Categoría/subcategoría** | category siempre `musica`; subcategory null 143/143 | **No** (sin datos) |
| **Gratis** (`price_min=0`) | 0 eventos hoy | Ya existe el chip (vacío honesto) |

Hallazgos de código (dónde se integra):

- `packages/catalog-client/src/client.ts` — `listEvents({ limit, search, cursor, range })`
  con keyset en dos fases, `Prefer: count=exact` y `name=ilike`. La Etapa 4 añadió
  `range` (ver `docs/front-catalogo-eventos.md`).
- `apps/web/components/EventList.tsx` — listado de `/eventos`: scroll infinito,
  búsqueda con debounce, chips de rango, snapshot `mishow:eventos:snapshot`.
- `apps/web/lib/discovery.ts` — helpers puros de rango/featured/gratis.
- `apps/web/app/eventos/page.tsx` — ruta del catálogo.

Diferenciar: **comprobado** (tabla y rutas), **propuesta** (secciones 4-6).

## 3. Objetivos y alcance

- Filtrar el catálogo por **fuente**, **ciudad** y **estado** (available/sold_out),
  combinables entre sí y con la búsqueda y el rango de fecha ya existentes.
- Interacción mobile-first: acceso a filtros, selección, aplicar, limpiar y
  **resumen de filtros activos** (chips) con conteo de resultados.
- Recuperación clara cuando una combinación no devuelve nada.
- Estado reflejado en la URL (compartir/recargar) sin romper el export estático.

**Fuera de alcance:** filtros por categoría/subcategoría (sin datos); "recinto" como
lista de chips (35 valores — se evalúa typeahead, ver §6); cualquier cambio de
esquema o de la base; secciones de descubrimiento de la Home.

## 4. Comportamiento esperado

- **Fuente:** multiselección (PuntoTicket, Ticketmaster). Sin selección ⇒ todas.
- **Ciudad:** selección desde las ciudades existentes (lista acotada; las de mayor
  volumen primero). Una o varias.
- **Estado:** opción para `available` y `sold_out` (los informativos); `unknown`
  no se ofrece como filtro (coherente con "Confirmado" por defecto).
- **Combinación:** los filtros se aplican con AND entre facetas y, dentro de una
  faceta multivalor, OR (p. ej. ciudad = Santiago Centro **o** Providencia).
- **Conteo:** el total refleja la combinación activa ("37 eventos").
- **Filtros activos:** chips con lo seleccionado y un "Limpiar todo".
- **Vacío:** mensaje y acción para quitar el último filtro / limpiar.
- **URL:** parámetros tipo `?fuente=ticketmaster&ciudad=Santiago%20Centro&estado=sold_out`
  (combinables con `?q=` y `?rango=`); recargar restaura los filtros; reset del
  scroll al cambiar cualquier filtro.
- Se preservan scroll infinito, búsqueda, rango y tema.

## 5. Propuesta UX/UI mobile-first

- **Acceso:** botón "Filtros" junto al buscador con contador de filtros activos.
  Abre un **bottom sheet** accesible (foco atrapado, cerrar con Esc/overlay,
  `aria-modal`), cómodo para el pulgar.
- **Dentro del sheet:** secciones Fuente, Ciudad y Estado; selección con
  checkboxes/pills de área táctil adecuada; acciones "Aplicar" y "Limpiar".
- **Resumen:** sobre la lista, chips de filtros activos (quitar individualmente) +
  "Limpiar todo" + conteo. En desktop puede mostrarse como barra lateral o fila de
  chips; mobile manda.
- **Vacío:** "Sin resultados para estos filtros" + botón para limpiar.
- Accesibilidad: `aria-pressed`/`aria-checked`, foco visible, contraste AA, anuncio
  del conteo (`aria-live`).

## 6. Decisiones recomendadas y fundamento

| Tema | Decisión recomendada | Fundamento | ¿TL/PO? |
|---|---|---|---|
| Facetas | Fuente, Ciudad, Estado (available/sold_out) | Únicos campos con datos confiables | Sí (confirmar set) |
| Recinto | **No** como lista de chips; evaluar typeahead en una iteración posterior | 35 valores; una lista larga estorba en móvil | Sí |
| Estado `unknown` | No ofrecerlo como filtro | Es el 85 % y se presenta como "Confirmado" | Sí |
| Server vs cliente | Fuente/ciudad/estado **server-side** vía PostgREST en `listEvents` | Consistencia con la paginación keyset y el conteo total; evita traer todo al cliente | Sí (ver riesgo §7) |
| Gratis | Mantener como está (post-filtro, vacío honesto) | `price_min` vive en `sources` (jsonb); no cambia aquí | No |

## 7. Dependencias, riesgos y pendientes

- **Filtrar por campos jsonb de la vista.** `fuente` sale de `sources[].source` y
  `ciudad` de `venue.city`; ambos son jsonb dentro de `catalog_events_v2`.
  Filtrarlos server-side con PostgREST sobre una vista puede no ser directo. Antes
  de implementar, **investigar** si PostgREST permite el filtro sobre esas
  expresiones o si conviene **exponer columnas top-level** en la vista (p. ej.
  `source_codes text[]`, `city text`) para poder usar `in.`/`cs.`/`eq.` y mantener
  el conteo exacto. Si exponer columnas implica tocar la vista, es **decisión de
  datos TL/PO** (migración, como en la Etapa 1). Alternativa sin tocar datos:
  post-filtro cliente, pero rompe el conteo total y la paginación keyset ⇒ no
  recomendado para facetas de alto volumen.
- **Interacción con el keyset.** Cualquier filtro server-side nuevo debe entrar en
  las dos fases del cursor y en la query de conteo, igual que `range`.
- **Estado `unknown`** domina: el filtro de estado tendrá poco volumen hasta que
  las fuentes informen disponibilidad.
- La **Home** no cambia; esto es solo `/eventos`.

## 8. Criterios de aceptación verificables

- Filtrar por **fuente** (p. ej. Ticketmaster) muestra solo esos eventos y el
  conteo coincide con la BD (78 al momento del brief).
- **Ciudad** (p. ej. Santiago Centro) acota correctamente; multiselección aplica OR.
- **Estado** = sold_out muestra solo esos (17 hoy).
- **Combinación** fuente + ciudad + estado + búsqueda + rango aplica AND entre
  facetas; el total refleja la combinación.
- **Vacío:** una combinación sin resultados muestra mensaje y acción de limpiar;
  conteo 0.
- **URL:** recargar con los parámetros restaura los filtros; back/forward coherente;
  cambiar un filtro resetea el scroll sin duplicados ni saltos.
- **A11y:** bottom sheet con foco atrapado y cierre por teclado; chips con estado
  accesible; contraste AA en claro y oscuro.
- **Sin regresiones:** scroll infinito, búsqueda, rango, tema y hora intactos;
  `npm run qa` y `npm run -w apps/web build` pasan.

## 9. Verificación

- Tests de `@mishow/catalog-client` (fetch inyectado): cada filtro arma la query
  correcta; combinados; conteo; keyset con filtros activos.
- Tests de la lógica pura de parseo/serialización de filtros ↔ URL.
- Build export estático y verificación headless (móvil 390 / desktop 1440):
  aplicar/limpiar, chips activos, conteo, combinación vacía.

## 10. Plan sugerido (al aprobar)

1. **Investigación de datos** (bloqueante): confirmar si fuente/ciudad se pueden
   filtrar server-side sobre `catalog_events_v2` o si hay que exponer columnas
   (decisión TL/PO). Sin esto, no se implementa.
2. `catalog-client`: extender `listEvents` con los filtros confirmados + tests.
3. Front `/eventos`: bottom sheet de filtros, chips activos, conteo, vacío, URL.
4. Verificación (qa, build, headless) y PR.
