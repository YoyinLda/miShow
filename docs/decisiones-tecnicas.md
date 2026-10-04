# Decisiones técnicas

## Decisiones confirmadas

| Área | Decisión | Motivo general |
|---|---|---|
| Experiencia | Mobile-first | El descubrimiento y compra de entradas ocurre frecuentemente desde teléfonos. |
| Frontend | Next.js, React y Tailwind CSS | Stack conocido, productivo y con buen ecosistema. |
| Nube | AWS | Permite integrar cómputo, colas, base de datos, distribución y observabilidad. |
| API | API Gateway y Lambda | Adecuado para un inicio con tráfico variable y bajo costo fijo. |
| Scraping | ECS Fargate Tasks | Aísla navegadores y permite trabajos con más duración y recursos que una Lambda. |
| Base de datos | RDS PostgreSQL | Modelo relacional apropiado para eventos, artistas, funciones, recintos y fuentes. |
| Mensajería | SQS | Desacopla ingesta y procesamiento, y facilita reintentos. |
| Programación | EventBridge | Permite planificar actualizaciones por fuente. |
| Correo | SES | Integración directa con AWS para notificaciones futuras. |
| Trazabilidad | W3C Trace Context | Mantiene correlación estándar entre servicios. |

## Decisiones abiertas

| Tema | Alternativas iniciales | Criterio para decidir |
|---|---|---|
| Scraper | Playwright / Puppeteer | Compatibilidad con fuentes, estabilidad, imagen de contenedor y experiencia de desarrollo. |
| Infraestructura como código | CDK / Terraform / otro | Experiencia, mantenibilidad y automatización. |
| Autenticación | Sin login en MVP / Cognito / proveedor externo | Casos reales que requieran favoritos, alertas o administración. |
| Búsqueda | PostgreSQL / motor especializado | Volumen, relevancia, filtros y costo operacional. |
| Fuente inicial | Por definir | Cobertura, estabilidad técnica y valor para usuarios en Chile. |

## Registro de nuevas decisiones

Cuando se cierre una decisión relevante, documentarla con:

- Fecha.
- Estado: propuesta, aceptada, reemplazada o descartada.
- Contexto y restricciones.
- Alternativas consideradas.
- Consecuencias y compromisos.

### 2026-09-13 — Organización del código: monorepo con npm workspaces

- **Estado:** aceptada.
- **Contexto:** una sola persona, contratos compartidos entre scraper, dominio,
  persistencia y frontend; se busca no pagar el costo de reorganizar más adelante.
- **Alternativas:** repositorios separados desde el inicio.
- **Consecuencias:** fronteras por paquete (`@mishow/*`) e importación por nombre;
  cada workspace puede extraerse a su propio repo sin reescrituras. Ver
  `docs/brief-etapa1-estructura-frontend.md`.

### 2026-09-13 — Renderizado frontend: estático (SSG), preparado para híbrido

- **Estado:** aceptada.
- **Contexto:** arranque a costo cero sin servidor permanente; el acceso a datos
  está aislado en `@mishow/catalog-client`.
- **Alternativas:** SSR/ISR desde el inicio.
- **Consecuencias:** `apps/web` exporta estático (`output: "export"`). La ruta de
  migración a híbrido está documentada en `apps/web/next.config.mjs` y no requiere
  cambiar la UI ni la capa de datos.

### 2026-09-13 — Hosting frontend: Cloudflare Pages

- **Estado:** aceptada.
- **Contexto:** publicar el export estático a costo cero (plan gratuito, 500
  builds/mes). El DNS podría gestionarse en GoDaddy.
- **Alternativas:** hosting estático en S3/CloudFront (arquitectura AWS futura).
- **Consecuencias:** despliegue por workflow al hacer push a `main`; solo la clave
  publishable llega al navegador. Ver `docs/despliegue-cloudflare-pages.md`.

### 2026-09-13 — Scraping programado: cron 2x/día en GitHub Actions

- **Estado:** aceptada.
- **Contexto:** validar frescura del catálogo dentro de la cuota gratuita de
  Actions; una sola fuente (PuntoTicket) y volumen bajo.
- **Alternativas:** frecuencia mayor, o ECS Fargate + EventBridge (etapa futura).
- **Consecuencias:** 2 corridas/día (12:00 y 22:00 UTC), `--max-events 2`,
  persistencia idempotente y fallos visibles en Actions. Ver
  `docs/operacion-scraping-cron.md`.


### 2026-09-13 — Presentación en la web: estado por defecto "Confirmado" y enlace único a la ticketera

- **Estado:** aceptada.
- **Contexto:** tras el e2e detectamos que la UI restaba confianza al mostrar
  "Por confirmar" cuando faltaba evidencia, y que el enlace al evento solo
  aparecía si existía un `purchase_url` de venta. miShow no es la fuente de
  verdad de la disponibilidad: es un puente entre la persona y las ticketeras.
- **Alcance:** cambios solo de presentación en `apps/web`. No se tocan el
  contrato (`@mishow/domain`, `@mishow/catalog-client`), la base de datos ni el
  scraper: el estado `unknown` se sigue persistiendo igual; solo cambia cómo se
  interpreta al mostrarlo.
- **Decisiones:**
  - **Estado a nivel evento:** por defecto se asume **Confirmado**. `statusLabel`
    mapea `unknown → "Confirmado"`; `available`, `sold_out` y `upcoming`
    conservan sus etiquetas ("Disponible", "Agotado", "Próximamente").
  - **Estado a nivel función:** cuando no hay información de disponibilidad
    (`unknown`) se omite la etiqueta y se muestra solo la fecha/hora, vía el
    nuevo helper `performanceStatusLabel` (devuelve `undefined` para `unknown`).
  - **Enlace a la ticketera:** siempre se ofrece un enlace hacia `source_url`
    (la URL del evento en la ticketera) con el texto genérico "Ir a la ticketera",
    tanto en la card del listado (`EventCard`) como en el detalle (`EventDetail`).
    Se eliminó el flujo de compra dentro de miShow (botón "Comprar" por función y
    el enlace condicionado a `purchase_url`): la compra se completa en la
    ticketera.
- **Alternativas:** introducir estados nuevos en el contrato (`confirmed`,
  `cancelled`) y persistirlos; descartada por ahora para evitar tocar dominio,
  DB y scraper. La detección explícita de eventos cancelados queda fuera de
  alcance.
- **Consecuencias:** presentación más honesta y accionable. `EventCard` pasó de
  ser un `<a>` a un `<article>` con enlace-overlay al detalle, para permitir el
  CTA externo sin anidar enlaces. Ver `apps/web/lib/format.ts`,
  `apps/web/components/EventCard.tsx` y `apps/web/components/EventDetail.tsx`.

### 2026-10-04 — Entorno de desarrollo Windows y runtime Node 24 en CI

- **Estado:** aceptada (registrada retroactivamente, ver
  `docs/briefs/004-migracion-entorno-windows.md`).
- **Contexto:** el desarrollo pasa a Windows + PowerShell. CI fijaba Node 20.18.1,
  bajo el mínimo de `vite@7` / `eslint-visitor-keys@5` (>=20.19), y las actions v4
  usan Node 20, deprecado en GitHub Actions.
- **Alternativas:** Node 20.19.x en CI; actions v7; `shell: true` o `cross-spawn`
  para los tests de CLI.
- **Consecuencias:** CI y local usan Node 24.21.0 con `actions/checkout@v5` y
  `actions/setup-node@v5`. Los tests que invocan npm usan el helper portable
  `runNpm` (Windows, macOS, Linux). La configuración MCP del asistente vive en la
  config de usuario, fuera del repo. Ver `docs/entorno-desarrollo-windows.md`.

### 2026-10-04 — Hora desconocida: mostrar solo la fecha (Brief 005, Etapa 1)

- **Estado:** aceptada.
- **Contexto:** una fecha sin hora llegaba al front como `00:00`, indistinguible
  de una medianoche real. Se necesita diferenciar "hora por confirmar" de una
  hora válida sin inventar valores ni alterar la fecha por zona horaria.
- **Decisión TL/PO:** cuando la hora es desconocida, el front muestra **solo la
  fecha** (p. ej. `vie 15 nov 2026`), sin `00:00` y **sin leyenda**. Con hora
  conocida (incluida una medianoche real) se muestra fecha + hora en
  `America/Santiago`. La fecha nunca cambia de día por conversión de zona.
- **Modelo de datos:** nueva columna `performances.time_known boolean not null
  default true`. **Sin backfill**: las filas existentes quedan como "hora
  conocida" y la verdad nueva (`time_known=false`) llega con la próxima corrida
  del scraper. El contrato (`EventPerformance`, `CatalogPerformance`) gana
  `time_known?: boolean` (opcional/retrocompatible). La regla fecha-only vs
  fecha+hora se centraliza en `hasKnownTime` (dominio) y se calcula una vez en la
  normalización; los scrapers dejan de fabricar `T00:00:00` sin hora real.
- **Alternativas:** leyenda "Hora por confirmar" (descartada por TL/PO);
  backfill heurístico (descartado por el riesgo de confundir medianoche real).
- **Consecuencias:** la vista `catalog_events_v2` expone `time_known` por función
  y `next_performance_time_known` a nivel evento. Migración creada pero **no
  aplicada**: requiere `supabase db push` del TL/PO + una corrida de scraper. Ver
  `supabase/migrations/20261004120000_performance_time_known.sql`,
  `apps/web/lib/format.ts` y el Brief 005.

### 2026-10-04 — Paginación por scroll infinito con keyset en dos fases (Brief 005, Etapa 2)

- **Estado:** aceptada.
- **Contexto:** el home traía `listEvents({ limit: 100 })` y filtraba en memoria,
  truncando el catálogo (~142 eventos) y sin búsqueda server-side. Se necesita un
  listado completo, fluido y mobile-first.
- **Decisión TL/PO:** consumo incremental (scroll infinito) que pide más datos
  según la interacción del usuario, no por paginación numérica.
- **Keyset en dos fases** sobre el orden `(next_performance_at asc nullslast,
  id asc)`:
  - **Fase A (no-nulos):** `or=(next_performance_at.gt.<a>,and(next_performance_at.eq.<a>,id.gt.<i>))`.
  - **Fase B (nulos):** `next_performance_at=is.null` ordenado por `id.asc`,
    keyset `id=gt.<i>`.
  - El cursor es opaco (`{ phase, nextAt, id }`): el front solo lo reenvía, nunca
    inspecciona ni construye sus campos. `listEvents` decide la transición A→B.
- **Total global:** se obtiene en la PRIMERA página vía `Content-Range` con
  `Prefer: count=exact` (conteo del universo completo, sin filtros de fase; solo
  `name=ilike` si hay búsqueda). En páginas siguientes el total no se recalcula:
  el front conserva el primero. Si el header falta o es `*/x`, `total` cae a
  `null` y el conteo se oculta (fallback probado).
- **Estado en URL:** solo se persiste el término de búsqueda en `?q=` vía
  `history.replaceState` (sin recargar). **No** se persiste el número de bloques
  cargados: al recargar con `?q=` el listado arranca desde el primer bloque con
  ese término.
- **Búsqueda server-side** con debounce ~300ms (`name=ilike.*term*` en todas las
  queries); se eliminó el filtro en memoria.
- **Restauración al volver del detalle (pragmática):** antes de navegar a
  `/evento` se guarda un snapshot `{ term, items, cursor, total, scrollY }` en
  `sessionStorage`. Al montar, si la Navigation Timing API reporta `back_forward`
  y el `term` coincide con `?q=`, se restauran items/cursor/total/scroll; si no,
  se arranca limpio. **Limitación conocida:** en Next (App Router) el back desde
  una navegación client-side puede no reportarse como `back_forward`; en ese caso
  se degrada a arranque limpio sin romper. No se persiste entre pestañas ni tras
  cerrar el navegador (sessionStorage).
- **Lógica pura testeable:** la acumulación/estado vive en
  `apps/web/lib/event-list-state.ts` (`appendPage` sin duplicados por `id`,
  `resetForSearch`, `canLoadMore`, `serializeSnapshot`/`parseSnapshot`) con tests
  en `apps/web/tests/event-list-state.test.ts`. No hay jsdom: los tests del front
  son de lógica pura, sin render de componentes.
- **Accesibilidad:** además del centinela con `IntersectionObserver`, hay un
  botón `type="button"` "Cargar más" con `aria-busy`/`disabled` y guard anti
  doble disparo; el conteo total usa `aria-live="polite"`.
- **Alternativas:** paginación numérica con `range`/offset de PostgREST
  (descartada por TL/PO a favor del scroll infinito). Si en el futuro se confirma
  ausencia sistemática de `Content-Range`, se evaluaría ese plan B.
- **Consecuencias:** `output: "export"` se conserva (todo el fetch es
  client-side). `EventCard`, los tokens/modo oscuro y ArtistDetail/VenueDetail no
  se tocan. Ver `apps/web/components/EventList.tsx`,
  `apps/web/lib/event-list-state.ts` y `packages/catalog-client/src/client.ts`.

### 2026-10-04 — Tema oscuro con tokens semánticos (Brief 005, Etapa 3)

- **Estado:** aceptada.
- **Contexto:** la paleta del front usaba utilidades sueltas (`neutral-*`,
  `bg-white`, `red-*`, `amber-*`, `bg-neutral-900 text-white`) sin soporte de modo
  oscuro ni identidad de marca. Se necesita respetar el modo del sistema, permitir
  elegir tema y preparar el rediseño de Etapa 4, sin tocar la lógica de scroll
  infinito ni la semántica del estado/enlace a ticketera.
- **Decisión TL/PO (Opción B):** tokens semánticos en CSS (`:root`) mapeados a
  utilidades Tailwind v4 vía `@theme`; override por atributo `data-theme` en
  `<html>`; toggle de 3 estados (claro/oscuro/sistema) persistido en
  `localStorage` (clave `mishow-theme`); script anti-flash previo al paint.
- **Alternativas:**
  - *Solo sistema* (`prefers-color-scheme`, sin toggle): más simple, pero no deja
    al usuario forzar un tema; descartada por falta de control.
  - *Toggle persistido con tokens + anti-flash* (elegida): un único set de
    utilidades semánticas, sin `dark:` por elemento; el atributo manda sobre la
    media query (`:root:not([data-theme])` sigue al sistema solo sin atributo).
- **Tokens:** `bg`, `surface`, `surface-2`, `text`, `text-muted`, `border`,
  `brand` (violeta), `brand-contrast`, `focus`, `danger`, `warning`, `success`
  (con variantes `-contrast`/`-surface`). Valores claro/oscuro y ratios AA en
  `docs/front-tokens-tema.md`. Marca: `#6d28d9` (claro) / `#a78bfa` (oscuro).
- **Consecuencias:** `output: "export"` se conserva; el toggle es `'use client'`.
  La utilidad para `--color-text-muted` es `text-text-muted` (prefijo `text-` +
  nombre de token). Rediseño de jerarquía/tarjetas queda para Etapa 4 (marcado con
  `// TODO Etapa 4` donde aplica). Ver `apps/web/app/globals.css`,
  `apps/web/app/layout.tsx`, `apps/web/components/ThemeToggle.tsx`,
  `apps/web/lib/theme.ts` y los componentes de listado/detalle.
