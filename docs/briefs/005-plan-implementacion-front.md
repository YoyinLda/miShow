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

## Etapa 1 — Hora desconocida (Obj.1) — ✅ implementada (pendiente migración + deploy)

> Implementada en la rama `feat/etapa1-hora-desconocida` (2026-10-04). La
> migración `20261004120000_performance_time_known.sql` **no fue aplicada**:
> requiere `supabase db push` del TL/PO + una corrida del scraper para poblar
> `time_known=false` en datos nuevos (sin backfill). Verificación en
> `.agents/tasks/etapa1-hora-desconocida/verificacion-etapa1.md`.

- [x] 1.1 Contrato: `time_known?: boolean` en `EventPerformance` (+ helper
      `hasKnownTime` en el dominio). Archivos: `packages/domain/src/contracts.ts`,
      `packages/domain/src/time.ts`.
- [x] 1.2 Scrapers: emiten date-only cuando la fuente no da hora y propagan
      `time_known`. Archivos: `scrapers/ticketmaster/src/extraction/detail.ts`
      (`dateFromDescription`), `scrapers/puntoticket/src/extraction/detail.ts`
      (`dateFromSpanish`), `scrapers/core/src/normalization.ts` (regla única con
      `hasKnownTime`), `scrapers/core/src/persistence/mapping.ts` (`mapPerformance`).
- [x] 1.3 Datos/vista: columna `performances.time_known` + `time_known` por
      función y `next_performance_time_known` a nivel evento en
      `catalog_events_v2`; RPC `persist_normalized_event` acepta/escribe
      `time_known` (default true). **Migración creada, NO aplicada** (decisión
      TL/PO). Archivo: `supabase/migrations/20261004120000_performance_time_known.sql`.
- [x] 1.4 Tipo de catálogo: `time_known?: boolean` en `CatalogPerformance` y
      `next_performance_time_known` en `CatalogEvent`. Archivo:
      `packages/catalog-client/src/types.ts`.
- [x] 1.5 Front: `formatDate(iso, { timeKnown })` muestra **solo la fecha** cuando
      `timeKnown===false` (sin hora ni leyenda); hora conocida (incl. medianoche
      real) muestra fecha + hora. Archivos: `apps/web/lib/format.ts`,
      `apps/web/components/EventCard.tsx`, `apps/web/components/EventDetail.tsx`.

**Resultado visible:** eventos cuya próxima función tiene hora desconocida
muestran solo la fecha (sin "00:00" ni leyenda) en card y detalle; con hora
conocida se muestra fecha + hora. El cambio de datos entra con la próxima corrida
del scraper (sin backfill).

**Desajuste conocido (fuera de alcance Etapa 1):** `ArtistDetail`/`VenueDetail`
consumen `CatalogEventBrief.next_at` (sin `time_known` por función); mostrar solo
fecha ahí requeriría ampliar las vistas `catalog_artists_v1`/`catalog_venues_v1`.
Registrado como pendiente.

---

## Etapa 2 — Paginación + fin del truncado (Obj.2)

Depende de decisión TL/PO (mecanismo keyset vs offset).

- [ ] 2.1 `catalog-client`: `listEvents({ limit, cursor?, search? })` → devuelve
      `{ items, total, nextCursor }`; agregar header `Prefer: count=exact` y leer
      `Content-Range`; mover la búsqueda a server-side (`name=ilike`).
      Archivos: `packages/catalog-client/src/client.ts:52-58` (+ `request` para
      exponer headers); tipos en `src/types.ts`.
      Verifica: tests de `@mishow/catalog-client` con fetch inyectado
      (paginación, total, orden estable, búsqueda).
- [ ] 2.2 Front home: consumir paginación, estado en URL, reset al filtrar,
      estados vacío/carga/error; quitar el filtro en memoria y el `limit:100`.
      Archivos: `apps/web/components/EventList.tsx:16-120`;
      `apps/web/app/page.tsx`.
      Verifica: `npm run -w apps/web build`; validación manual (abajo).

**Resultado visible:** el home lista los 142 eventos paginados, con total y
navegación por páginas persistida en URL; sin duplicados ni saltos.

---

## Etapa 3 — Tokens de color y modo oscuro (Obj.4)

Depende de decisión TL/PO (estrategia de tema).

- [ ] 3.1 Definir tokens semánticos (CSS vars + `@theme` de Tailwind v4) para
      bg/surface/text/border/brand(violeta)/focus/estados.
      Archivos: `apps/web/app/globals.css` (hoy sólo `color-scheme`).
      Verifica: build; inspección visual claro/oscuro.
- [ ] 3.2 Aplicar tokens en componentes reemplazando `neutral-*` por utilidades
      semánticas; set único de clases.
      Archivos: `layout.tsx`, `EventCard.tsx`, `EventDetail.tsx`, `EventList.tsx`.
      Verifica: build; contraste AA (claro/oscuro); foco visible.
- [ ] 3.3 Estrategia de tema: `prefers-color-scheme` + toggle persistido con
      script anti-flash previo al paint (si TL/PO lo aprueba).
      Archivos: `apps/web/app/layout.tsx` (script inline), nuevo componente toggle.
      Verifica: cambio de tema persiste sin flash; build.

**Resultado visible:** la app respeta el modo del sistema y (si se aprueba el
toggle) permite elegir tema; identidad violeta presente de forma coherente.

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
  - Fechas: evento sin hora → solo la fecha (sin "00:00" ni leyenda); con hora →
    hora correcta; medianoche real (`time_known=true`) muestra la hora.
  - Paginación: recorrer todas las páginas, back/forward, reset al filtrar.
  - Tema: claro/oscuro, persistencia, sin flash, foco visible, contraste AA.
  - Filtros: aplicar/limpiar, chips, conteo, combinación vacía.

## Notas de riesgo
- Etapas 1.3 y 2.1 tocan contrato/datos: coordinar con TL/PO antes.
- Backfill de `time_known` para datos existentes: definir estrategia (esperar
  próxima corrida vs backfill heurístico), asumiendo riesgo de medianoche real.
