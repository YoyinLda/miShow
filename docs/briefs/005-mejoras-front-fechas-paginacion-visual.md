# Brief 005 — Mejoras del front: fechas/horas, paginación, visual, modo oscuro y filtros

> Estado: **propuesta** (pendiente de aprobación TL/PO). Mobile-first.
> Alcance principal: `apps/web`, `@mishow/catalog-client`; con dependencias de
> datos/contrato señaladas como decisiones TL/PO.

## 1. Contexto / problema

El front sobre `catalog_events_v2` (brief 004) está funcional pero tiene cinco
problemas concretos de experiencia y correctitud, verificados en código y datos:

1. **Horas inventadas.** Cuando una fuente sólo informa la fecha, el pipeline
   rellena la hora con `00:00:00` y el front la muestra como si fuera real. No
   se distingue "hora por confirmar" de un evento real a medianoche.
2. **Listado truncado y sin paginar.** El home descarga hasta 100 eventos y
   filtra en memoria; con 142 eventos en catálogo, **se dejan de mostrar ~42**.
3. **Sin identidad visual.** Todo es paleta `neutral`; no hay violeta de marca
   ni tokens.
4. **Sin modo oscuro real.** Sólo `color-scheme: light dark`; cero clases
   `dark:`, sin toggle.
5. **Sin filtros por faceta.** Sólo búsqueda textual; y los campos obvios
   (categoría/subcategoría) no tienen datos útiles.

## 2. Investigación (hallazgos verificados)

Detalle completo en `.agents/tasks/investigacion-brief-005.md`. Resumen con
evidencia:

| # | Hallazgo | Evidencia |
|---|---|---|
| 1 | `starts_at` obligatorio, sin flag de incertidumbre | `packages/domain/src/contracts.ts:20-26`; `performances.starts_at timestamptz NOT NULL` (BD) |
| 1 | Scrapers rellenan `00:00:00` al faltar hora | `scrapers/ticketmaster/src/extraction/detail.ts:45-58`; `scrapers/puntoticket/src/extraction/detail.ts:113-125,158` |
| 1 | Fecha-only → medianoche Santiago | `packages/domain/src/time.ts:26-49` |
| 1 | Front siempre muestra fecha+hora Santiago | `apps/web/lib/format.ts:48-61`; `apps/web/components/EventDetail.tsx:130` |
| 1 | 25/161 performances a las 00:00 Santiago; 136 con hora real | consulta BD `performances` |
| 2 | Sin paginación; sólo `limit`+`name ilike` | `packages/catalog-client/src/client.ts:52-58` |
| 2 | Descarga 100 + filtro en memoria | `apps/web/components/EventList.tsx:33,50-61` |
| 2 | 142 eventos en `catalog_events_v2` → truncado | consulta BD |
| 3 | Sin violeta en fuentes (sólo build) ; paleta `neutral` | `EventCard.tsx`, `EventDetail.tsx`, `layout.tsx`, `globals.css` |
| 4 | Modo oscuro no implementado | `apps/web/app/globals.css` (sólo `color-scheme`) |
| 5 | `category='musica'` siempre; `subcategory` null 142/142 | consulta BD `events` |
| 5 | Fuentes TM 78 / PT 64; venues 35; status 120 unknown/17 sold_out/4 available/1 upcoming | consulta BD |

Distinguir siempre: **comprobado** (tabla), **hipótesis** (ej.: la mayoría de
las 25 a 00:00 son "hora no informada"), **propuesta** (secciones 4-5).

## 3. Objetivos y alcance

- Mostrar fechas/horas con honestidad: cuando la hora no se conoce, mostrar solo
  la fecha (omitir la hora); nunca inventar 00:00.
- Paginar el listado mobile-first, con conteo total y estado en URL, sin romper
  el export estático.
- Introducir identidad violeta coherente y mejorar jerarquía/legibilidad en móvil.
- Definir modo oscuro con colores semánticos y buen contraste (AA).
- Ofrecer filtros útiles sólo sobre datos confiables.

**Fuera de alcance:** reintroducir compra dentro de miShow; cambiar la semántica
de estado "Confirmado" por defecto (decisión 2026-09-13, `docs/decisiones-tecnicas.md`);
cambios de logo en Figma.

## 4. Comportamiento esperado

### 4.1 Fechas/horas
- Si la hora es conocida: `vie 15 nov 2026, 21:00` (como hoy, zona Santiago).
- Si la hora es desconocida: mostrar **solo la fecha** `vie 15 nov 2026`; omitir
  la hora por completo (sin "00:00" ni leyenda "Hora por confirmar").
  (Decisión TL/PO 2026-10-04.)
- La **fecha** nunca cambia por conversión de zona (ya se usa `America/Santiago`
  explícito en `format.ts`).
- Multi-función: cada función aplica la misma regla de forma independiente.

### 4.2 Paginación
- Página de tamaño fijo (propuesto **20** en móvil).
- Orden estable `next_performance_at asc nullslast, id asc`.
- Conteo total visible ("142 eventos").
- Al cambiar filtros/búsqueda: **reset** a la primera página.
- Estado en URL (`?page=` o cursor) con back/forward funcional.
- Estados vacío / cargando / error explícitos; sin duplicados ni saltos.

### 4.3 Visual, 4.4 modo oscuro, 4.5 filtros: ver secciones 5-6.

## 5. Propuesta UX/UI mobile-first

### Objetivo 1 — Hora desconocida
- **Origen (recomendado):** marcar en el pipeline cuándo la hora es desconocida.
  Opción A (recomendada): nueva columna `performances.time_known boolean`
  (default según evidencia), propagada por contrato → mapping → RPC persist →
  vista `catalog_events_v2` → `CatalogPerformance.time_known`. Los scrapers fijan
  `time_known=false` cuando sólo parsean fecha.
- **Front:** `format.ts` expone `formatDate(iso, { timeKnown })` que, cuando
  `timeKnown===false`, muestra **solo la fecha** (omite la hora por completo,
  sin leyenda).
- **Decisión TL/PO:** es cambio de datos/contrato (ver §8).

### Objetivo 2 — Paginación
- **Mecanismo recomendado: keyset/cursor** por `(next_performance_at, id)` para
  orden estable y sin saltos al insertarse datos; **conteo total** con
  `Prefer: count=exact` y header `Content-Range` de PostgREST.
  - Alternativa: range/offset (más simple, pero con riesgo de saltos y peor en
    páginas profundas). Decisión TL/PO (§8).
- **`catalog-client`:** `listEvents` acepta `{ limit, cursor?, search? }` y
  devuelve `{ items, total, nextCursor }` leyendo `Content-Range`. La búsqueda
  por texto pasa a ser server-side (`name=ilike`) para que la paginación sea
  consistente (hoy el filtro es en memoria).
- **URL:** query param para página/cursor; reset al cambiar filtros.
- Mobile: botón "Cargar más" o paginación numérica compacta; mantener posición
  al volver desde el detalle.

### Objetivo 3 — Visual
- **Conservar:** estructura de card de lista y de detalle, wordmark "miShow",
  decisión de estado/enlace a ticketera.
- **Ajustar:** jerarquía tipográfica (nombre del evento más protagonista),
  espaciado y densidad para móvil, estados/badges, foco visible; tratar la
  imagen con relación de aspecto estable.
- **Reemplazar:** paleta `neutral` plana por un sistema con **acento violeta**
  de marca (tokens semánticos, §Obj.4) aplicado a enlaces, foco, badge de estado
  y CTA.

### Objetivo 4 — Modo oscuro (sistema de color semántico)
- Definir **tokens CSS** (variables) para: `--bg`, `--surface`, `--surface-2`,
  `--text`, `--text-muted`, `--border`, `--brand` (violeta), `--focus`, y estados
  (`--danger`, `--warning`, `--success`). Mapear a utilidades Tailwind v4 vía
  `@theme`.
- Un **único set** de clases en componentes; el tema cambia los valores, no las
  clases por pantalla (evita colores sueltos).
- **Estrategia (propuesta):** respetar `prefers-color-scheme` por defecto y
  ofrecer toggle con persistencia (localStorage) aplicado antes del paint para
  evitar flash en export estático. Decisión TL/PO (§8).
- Contraste **AA** (≥4.5:1 texto normal) en claro y oscuro; foco visible en ambos.

### Objetivo 5 — Filtros y secciones
- **Viables (datos confiables):**
  - **Fuente** (PuntoTicket / Ticketmaster).
  - **Rango de fecha / "Próximos"** (hoy, este mes, elegir rango).
  - **Recinto o ciudad** (35 venues).
  - **Estado** (sólo `available`/`sold_out`; **no** exponer `unknown`, coherente
    con la decisión vigente) — prioridad baja.
- **No viables hoy:** categoría/subcategoría (sin datos útiles) → **no** agregar
  sin dependencia marcada.
- Interacción móvil: filtros en hoja inferior (bottom sheet) accesible; chips de
  filtros activos con "limpiar"; resumen de conteo ("142 resultados", "0 — ajusta
  filtros"); recuperación clara cuando una combinación no devuelve nada.
- Descubrimiento sin duplicar: una sola lista paginada; secciones como
  "Próximos" se implementan como presets de filtro, no listas paralelas.

## 6. Decisiones recomendadas y fundamento

| Objetivo | Decisión recomendada | Fundamento | ¿TL/PO? |
|---|---|---|---|
| 1 | Columna `time_known` en origen; si es desconocida, front muestra solo la fecha | Evita inventar 00:00; mantiene multi-función y modelo canónico | **Sí** (datos) |
| 2 | Keyset `(next_performance_at,id)` + `count=exact` | Orden estable, sin saltos, total exacto, compatible con SSG | **Sí** (mecanismo) |
| 3 | Introducir acento violeta vía tokens, conservar estructura | No hay identidad hoy; mínimo cambio con máximo impacto | No (presentación) |
| 4 | Tokens semánticos + `prefers-color-scheme` (+ toggle persistido) | Un sistema coherente, contraste AA; evita colores sueltos | **Sí** (estrategia) |
| 5 | Filtros: fuente, fecha, recinto/ciudad; estado opcional | Son los únicos campos con datos confiables | No (si no toca datos) |

## 7. Dependencias, riesgos y pendientes

- Obj.1 depende de cambio de datos/contrato → coordinar con pipeline y re-scrape
  o backfill de `time_known` (evaluar: ¿backfill por heurística 00:00 o esperar
  próxima corrida?). Riesgo: marcar mal un evento real a medianoche.
- Obj.2: la búsqueda pasa a server-side; validar comportamiento de `ilike` con
  acentos y conteo exacto en Data API bajo RLS.
- Obj.4: evitar flash de tema en export estático (script inline previo al paint).
- Pendiente no verificable: cuáles de las 25 performances a 00:00 son medianoche
  real (requiere revisar fuente original).

## 8. Decisiones que requieren aprobación TL/PO (bloquean implementación)

1. Agregar columna `performances.time_known` (o equivalente) y su propagación por
   contrato/vista. Cambio de datos.
2. Mecanismo de paginación (keyset vs offset) y cambios en `catalog-client`.
3. Estrategia de tema oscuro (solo sistema vs toggle persistido) y manejo de flash.
4. Alcance del rediseño visual sin alterar decisiones de estado/compra vigentes.

## 9. Criterios de aceptación verificables

- **Hora desconocida:** un evento con `time_known=false` muestra **solo la
  fecha**, sin "00:00" ni leyenda, en card y detalle. Test unitario de
  `format.ts` cubre: hora conocida, hora desconocida (solo fecha), medianoche
  real (`time_known=true` a 00:00 muestra "00:00").
- **Zona horaria:** una función `2026-11-15T21:00:00-03:00` se muestra `21:00`
  en Santiago; una fecha-only no corre de día.
- **Paginación:** con 142 eventos y página 20, se recorren todas las páginas sin
  duplicados ni saltos; el total mostrado = total real; cambiar filtro resetea a
  página 1; back/forward restaura la página; estados vacío/carga/error visibles.
- **Filtros combinados vacíos:** una combinación sin resultados muestra mensaje y
  acción para limpiar; el conteo refleja 0.
- **Contraste:** texto principal y CTA cumplen AA (≥4.5:1) en claro y oscuro;
  foco visible en ambos temas (verificación manual + revisión de tokens).
- **Sin regresiones:** `npm run -w apps/web build` y los tests de
  `@mishow/catalog-client` y de `format.ts` pasan.

## 10. Verificación (comandos)

- Typecheck/build front: `npm run -w apps/web build` (export estático).
- Lint: `npm run lint` (según scripts del repo).
- Tests unitarios de la capa de datos y formato: `npm test` del workspace
  afectado (`@mishow/catalog-client`, `apps/web`).
- Validación manual móvil/escritorio: ver plan `005-plan-implementacion-front.md`.
