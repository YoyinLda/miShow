# Plan de implementación 005 — Front (fechas, paginación, visual, modo oscuro, filtros)

> Acompaña a `005-mejoras-front-fechas-paginacion-visual.md`. Mobile-first.
> **No implementar hasta aprobar el brief** y las decisiones TL/PO (§8 del brief).
> Áreas de código identificadas por inspección (Codebase Memory + lectura directa).

## Orden recomendado y por qué

1. **Hora desconocida** (bajo riesgo, visible, desbloquea decisión de datos).
2. **Paginación + corrección del truncado a 100** (bug activo: faltan ~42 eventos).
3. **Tokens de color + modo oscuro** (base para el rediseño).
4. **Rediseño visual de tarjetas/jerarquía** (consume los tokens).
5. **Filtros y secciones** (encima de la paginación ya estable).

Se puede intercambiar 1↔2 si TL/PO prioriza el listado completo; se recomienda
1 primero porque es autocontenible y entrega valor sin tocar la capa de red.

---

## Etapa 1 — Hora desconocida (Obj.1)

Depende de decisión TL/PO (columna de datos). Dividida en back/contrato y front.

- [ ] 1.1 Contrato: agregar `time_known?: boolean` a `EventPerformance`.
      Archivos: `packages/domain/src/contracts.ts:20-26`.
      Verifica: typecheck del workspace domain pasa.
- [ ] 1.2 Scrapers: fijar `time_known=false` cuando sólo se parsea fecha.
      Archivos: `scrapers/puntoticket/src/extraction/detail.ts:113-125,158`;
      `scrapers/ticketmaster/src/extraction/detail.ts:49-58`; propagar en
      `scrapers/core/src/persistence/mapping.ts:134-147` (`mapPerformance`).
      Verifica: `npm test` de ambos scrapers (casos fecha-only vs fecha+hora).
- [ ] 1.3 Datos/vista: columna `performances.time_known` y exponerla en
      `catalog_events_v2.performances`. **Migración = decisión TL/PO.**
      Archivos: migración en `supabase/migrations/`; vista `catalog_events_v2`.
      Verifica: lectura read-only de la vista devuelve `time_known`.
- [ ] 1.4 Tipo de catálogo: agregar `time_known?: boolean` a `CatalogPerformance`.
      Archivos: `packages/catalog-client/src/types.ts:22-28`.
      Verifica: build de `@mishow/catalog-client`.
- [ ] 1.5 Front: `format.ts` muestra **solo la fecha** cuando `time_known=false`
      (omite la hora, sin leyenda); con hora conocida, fecha+hora como hoy.
      Parámetro `{ timeKnown }` en `formatDate`.
      Archivos: `apps/web/lib/format.ts:48-61`; usar en
      `apps/web/components/EventCard.tsx` (nextDate) y `EventDetail.tsx:130`.
      Verifica: tests unitarios de `format.ts` (hora conocida / desconocida: solo
      fecha / medianoche real: 00:00); `npm run -w apps/web build`.

**Resultado visible:** eventos sin hora muestran solo la fecha (sin "00:00" ni
leyenda); medianoche real (`time_known=true`) sigue mostrando "00:00".

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

## Etapa 4 — Rediseño visual de tarjetas y jerarquía (Obj.3)

Sin dependencia de datos; consume tokens de la etapa 3.

- [ ] 4.1 Rediseñar `EventCard` (jerarquía del nombre, imagen con aspecto estable,
      badge de estado con color de marca, foco visible, densidad móvil).
      Archivos: `apps/web/components/EventCard.tsx`.
      Verifica: build; revisión visual móvil/escritorio.
- [ ] 4.2 Ajustar `EventDetail` y `layout` (header/footer, tipografía, espaciado).
      Archivos: `apps/web/components/EventDetail.tsx`, `apps/web/app/layout.tsx`.
      Verifica: build; revisión visual.

**Resultado visible:** listado y detalle más legibles y con identidad miShow,
conservando la decisión de estado/enlace a ticketera.

---

## Etapa 5 — Filtros y secciones (Obj.5)

Encima de la paginación estable (etapa 2).

- [ ] 5.1 `catalog-client`: parámetros de filtro server-side por **fuente**,
      **rango de fecha** y **recinto/ciudad** (y `available/sold_out` opcional).
      Archivos: `packages/catalog-client/src/client.ts` (`listEvents`).
      Verifica: tests de `@mishow/catalog-client` por filtro y combinados.
- [ ] 5.2 Front: UI de filtros en bottom sheet accesible, chips activos + limpiar,
      resumen de conteo, recuperación en combinación vacía, reset de página.
      Archivos: `apps/web/components/EventList.tsx` (+ nuevo componente de filtros).
      Verifica: build; validación manual de filtros combinados.

**Resultado visible:** el usuario filtra por fuente/fecha/recinto con feedback de
conteo y puede limpiar; combinaciones vacías ofrecen salida.

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
