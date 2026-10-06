# Plan de implementación 005 — Front (fechas, paginación, visual, modo oscuro, filtros)

> Acompaña a `005-mejoras-front-fechas-paginacion-visual.md`. Mobile-first.
> Áreas de código identificadas por inspección (Codebase Memory + lectura directa).

## Estado (2026-10-04)

Etapas 1-4 **implementadas y en producción** (https://mishow.pages.dev). La
Etapa 5 (filtros avanzados), acotada en `005-etapa5-filtros.md`, está
**implementada** (facetas fuente/Lugar/estado server-side); pendiente de merge.

| Etapa | Objetivo | Estado | PR |
|---|---|---|---|
| 1 | Hora desconocida → solo fecha | ✅ | #13, #14 (fix migración) |
| 2 | Paginación (scroll infinito keyset) | ✅ | #15 |
| 3 | Tokens de color + modo oscuro (toggle 3 modos) | ✅ | #16 |
| 4 | Rediseño fiel a Figma 03 Screens (Home + Catálogo) | ✅ | #18 |
| 5 | Filtros avanzados (fuente, Lugar/ciudad, estado) | ✅ | pendiente de merge |

## Orden recomendado y por qué

1. **Hora desconocida** (bajo riesgo, visible, desbloquea decisión de datos).
2. **Paginación + corrección del truncado a 100** (bug activo: faltan ~42 eventos).
3. **Tokens de color + modo oscuro** (base para el rediseño).
4. **Rediseño visual de tarjetas/jerarquía** (consume los tokens).
5. **Filtros y secciones** (encima de la paginación ya estable).

Se puede intercambiar 1↔2 si TL/PO prioriza el listado completo; se recomienda
1 primero porque es autocontenible y entrega valor sin tocar la capa de red.

---

## Etapa 1 — Hora desconocida (Obj.1) ✅ implementada

Decisión TL/PO: solo-fecha cuando la hora es desconocida (sin "00:00" ni
leyenda); sin backfill (el default `true` preserva lo existente; la verdad nueva
llega por scraper). Migración aplicada a cloud; re-scrape poblado
(22/162 performances con `time_known=false` al cierre).

- [x] 1.1 Contrato: `time_known?: boolean` en `EventPerformance`.
      `packages/domain/src/contracts.ts`.
- [x] 1.2 Scrapers: `time_known=false` cuando sólo se parsea fecha.
      `scrapers/*/src/extraction/detail.ts`; `scrapers/core/src/persistence/mapping.ts`.
- [x] 1.3 Datos/vista: columna `performances.time_known` + vista
      `catalog_events_v2` (migración `20261004120000`; recreada con DROP+CREATE,
      PR #14). Expone `time_known` por función y `next_performance_time_known`.
- [x] 1.4 Tipo de catálogo: `time_known?: boolean` en `CatalogPerformance`.
      `packages/catalog-client/src/types.ts`.
- [x] 1.5 Front: `formatDate(iso, { timeKnown })` muestra solo fecha si es false;
      reloj 24 h (medianoche real = "00:00"). `apps/web/lib/format.ts` + tests.

**Resultado visible:** eventos sin hora muestran solo la fecha (sin "00:00" ni
leyenda); medianoche real (`time_known=true`) muestra "00:00" (reloj 24 h).

---

## Etapa 2 — Paginación + fin del truncado (Obj.2) ✅ implementada

Decisión TL/PO: **scroll infinito** (consumo incremental según interacción, no
paginación numérica) + **keyset en dos fases**. Detalle en
`docs/decisiones-tecnicas.md` (2026-10-04 — Paginación por scroll infinito).

- [x] 2.1 `catalog-client`: `listEvents({ limit, cursor?, search? })` → devuelve
      `{ items, total, nextCursor }`; agregar header `Prefer: count=exact` y leer
      `Content-Range`; mover la búsqueda a server-side (`name=ilike`).
      Archivos: `packages/catalog-client/src/client.ts:52-58` (+ `request` para
      exponer headers); tipos en `src/types.ts`.
      Verifica: tests de `@mishow/catalog-client` con fetch inyectado
      (paginación, total, orden estable, búsqueda).
- [x] 2.2 Front home: consumo incremental (scroll infinito + botón "Cargar más"),
      `?q=` en URL, reset al filtrar con debounce ~300ms, estados
      inicial/cargando-más/vacío/error con reintento; se quitó el filtro en
      memoria y el `limit:100`. Lógica pura en `apps/web/lib/event-list-state.ts`.
      Restauración pragmática al volver del detalle vía `sessionStorage`.
      Archivos: `apps/web/components/EventList.tsx`;
      `apps/web/lib/event-list-state.ts`; `apps/web/tests/event-list-state.test.ts`.
      Verifica: `npm run -w @mishow/web test` y `npm run -w @mishow/web build`.

**Resultado visible:** el home lista todos los eventos de forma incremental
(bloques de 20) con el total visible desde la primera carga; sin duplicados ni
saltos. El término de búsqueda se refleja en `?q=`.

---

## Etapa 3 — Tokens de color y modo oscuro (Obj.4) ✅ implementada

Decisión TL/PO (Opción B): tokens semánticos + `data-theme` + toggle de 3 estados
(claro/oscuro/sistema) con script anti-flash previo al paint. Detalle en
`docs/decisiones-tecnicas.md` (2026-10-04 — Tema oscuro con tokens semánticos) y
tabla de tokens en `docs/front-tokens-tema.md`.

- [x] 3.1 Definir tokens semánticos (CSS vars + `@theme` de Tailwind v4) para
      bg/surface/text/border/brand(violeta)/focus/estados.
      Archivos: `apps/web/app/globals.css`.
      Verifica: build; inspección visual claro/oscuro.
- [x] 3.2 Aplicar tokens en componentes reemplazando `neutral-*`/`bg-white`/
      `red-*`/`amber-*` por utilidades semánticas; set único de clases.
      Archivos: `layout.tsx`, `EventList.tsx`, `EventCard.tsx`, `EventDetail.tsx`,
      `ArtistDetail.tsx`, `VenueDetail.tsx`.
      Verifica: build; contraste AA (claro/oscuro); foco visible.
- [x] 3.3 Estrategia de tema: `prefers-color-scheme` + toggle persistido con
      script anti-flash previo al paint.
      Archivos: `apps/web/app/layout.tsx` (script inline), `apps/web/components/ThemeToggle.tsx`,
      `apps/web/lib/theme.ts`.
      Verifica: cambio de tema persiste sin flash; build.

**Resultado visible:** la app respeta el modo del sistema y permite elegir tema
(claro/oscuro/sistema) sin flash; identidad violeta presente de forma coherente.

---

## Etapa 4 — Rediseño fiel a Figma 03 Screens (Obj.3) ✅ implementada

Reencuadrada: el Figma "miShow — UX/UI Reference" tiene pantallas detalladas en
la página "03 Screens" (Home y Catálogo, mobile 390 y desktop 1440). Se rediseñó
el front fiel a esos frames, no solo colores. Detalle en
`docs/front-catalogo-eventos.md`. PR #18 (reemplazó al #17, que solo cambiaba
colores).

- [x] 4.1 Tokens alineados a Figma Foundations (bg #0C0C0F, surface #15151A,
      brand #8B5CF6, accent #FACC15, etc.) + tipografía Geist (`next/font/local`);
      tema claro accesible y toggle de 3 modos conservados. `globals.css`.
- [x] 4.2 Home (`/`): hero editorial, buscador, chips de rango, Destacados,
      Próximos conciertos, Escena local e Historias. `app/page.tsx` + componentes.
- [x] 4.3 Catálogo (`/eventos`): "Explora eventos" + chips + listado con scroll
      infinito (reusa `EventList`). Nueva ruta; Home y Catálogo separados.
- [x] 4.4 Regla de datos honesta (sin inventar): Destacados = fallback por
      cercanía; Próximos = dato real; Gratis = vacío honesto (0 eventos gratis);
      Escena local e Historias = estructura sin datos. Chips Hoy/Semana/Mes
      filtran server-side por fecha.

**Resultado visible:** Home de descubrimiento + Catálogo exhaustivo, fieles al
Figma, con identidad miShow; preserva scroll infinito, tema, hora y ticketera.

---

## Etapa 5 — Filtros avanzados (Obj.5) ✅ implementada

**Reencuadrada:** la Etapa 4 ya entregó los chips de rango (Hoy/Semana/Mes/Gratis)
y las secciones de descubrimiento. La Etapa 5 añade un panel de **filtros
avanzados** sobre el catálogo (`/eventos`): fuente, **Lugar** (ciudad) y estado,
en bottom sheet accesible, con chips activos, resumen de conteo y recuperación
ante combinación vacía. Detalle y datos verificados en `005-etapa5-filtros.md` y
en `.agents/tasks/miShow-feat-etapa5-filtros-2026-10-04/`.

**Implementado (todo server-side, sin tocar la base):**

- `@mishow/catalog-client`: `listEvents({ filters: { sources?, cities?, statuses? } })`
  traduce las facetas a PostgREST (`sources=cs.[…]`, `venue->>city=in.(…)`,
  `status=in.(…)`) en datos y conteo, componiendo AND entre facetas y con
  `q`/`rango`/keyset sin segundo `or=`. Sin filtros, request byte-idéntica.
- Front `/eventos`: botón "Filtros" con contador, bottom sheet accesible
  (`role=dialog`, `aria-modal`, foco atrapado, Esc/overlay, restaura foco),
  secciones Fuente/Lugar/Estado con pills `aria-checked`, chips de filtros
  activos (quitar individual + "Limpiar todo"), conteo con `aria-live`, estado
  vacío honesto y reset de scroll. Helpers puros filtros↔URL en `lib/filters.ts`.
- URL `?fuente=&ciudad=&estado=` vía `history.replaceState`, combinable con
  `?q=`/`?rango=`; recargar restaura. "Gratis" permanece como post-filtro cliente.

**Rótulo:** la ciudad se muestra como **"Lugar"** en la UI; los identificadores
internos (`venue`, `/venues`, `CatalogVenue`) no cambian.

**Resultado visible:** en `/eventos`, el usuario combina fuente + Lugar + estado
con feedback de conteo y puede limpiar; combinaciones vacías ofrecen salida.

---

## Validación funcional y visual (móvil y escritorio)

- **Build/typecheck:** `npm run -w apps/web build`; typecheck de paquetes tocados.
- **Lint:** `npm run lint`.
- **Tests:** `npm test` de `@mishow/catalog-client`, `apps/web/lib/format`, y
  scrapers (etapa 1).
- **Manual móvil (≤390px) y escritorio:**
  - Fechas: evento sin hora → "Hora por confirmar"; con hora → hora correcta.
  - Paginación: recorrer todas las páginas, back/forward, reset al filtrar.
  - Tema: claro/oscuro, persistencia, sin flash, foco visible, contraste AA.
  - Filtros: aplicar/limpiar, chips, conteo, combinación vacía.

## Notas de riesgo
- Etapas 1.3 y 2.1 tocan contrato/datos: coordinar con TL/PO antes.
- Backfill de `time_known` para datos existentes: definir estrategia (esperar
  próxima corrida vs backfill heurístico), asumiendo riesgo de medianoche real.
