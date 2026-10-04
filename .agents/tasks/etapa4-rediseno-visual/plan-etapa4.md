# Plan de implementación — Etapa 4: rediseño visual del front

Worktree: `c:\Yoyo\Dev\miShow\.worktrees\etapa4-rediseno-visual` (rama `feat/etapa4-rediseno-visual`).
Git: usar `git -C c:\Yoyo\Dev\miShow\.worktrees\etapa4-rediseno-visual`.

Objetivo: rediseño visual mobile-first alineado al Figma Foundations SIN romper
funcionalidad (scroll infinito, búsqueda server-side, toggle de tema, estado
"Confirmado" por defecto, enlace único "Ir a la ticketera", contratos de datos).
No tocar `@mishow/catalog-client`, la base, ni el logo.

## Hallazgos de la exploración (fuente de verdad: el worktree)

- `apps/web` usa Next 16.3.5 + Tailwind v4 (`@tailwindcss/postcss` 4.3.3) con
  `output: "export"` (SSG) en `apps/web/next.config.mjs`. La fuente debe ser
  compatible con export estático.
- Tokens semánticos ya existen en `apps/web/app/globals.css`: `:root` claro,
  `[data-theme='dark']` oscuro (azulado) y `@media prefers-color-scheme`
  restringido a `:root:not([data-theme])`. `@theme` expone utilidades
  `bg-bg/bg-surface/bg-surface-2/text-text/text-text-muted/border-border/
  bg-brand/text-brand-contrast/bg-brand-surface/ring-focus` + danger/warning/
  success. Estrategia: NO se usa `dark:` por elemento; el tema cambia valores.
- `ThemeToggle.tsx` (claro/oscuro/sistema) + `lib/theme.ts` (lógica pura con
  tests en `tests/theme.test.ts`). El script anti-flash vive en `layout.tsx`.
- Componentes a rediseñar: `components/EventCard.tsx`, `EventList.tsx`,
  `EventDetail.tsx`, `ArtistDetail.tsx`, `VenueDetail.tsx`. Layout en
  `app/layout.tsx`; páginas en `app/page.tsx`, `app/evento/page.tsx`,
  `app/artistas/page.tsx`, `app/venues/page.tsx`.
- Scroll infinito (Etapa 2) vive en `EventList.tsx` + `lib/event-list-state.ts`
  (IntersectionObserver + botón "Cargar más" + restauración por snapshot). NO
  tocar esa lógica; solo su presentación.
- Las 3 páginas de detalle usan `text-neutral-500` en el fallback de `Suspense`
  (valor fuera del sistema de tokens): se corrige a `text-text-muted`.
- NO hay `node_modules` instalado en el worktree: antes de cualquier build/test
  hay que `npm install` desde la raíz del worktree.
- No existe el paquete `geist` ni `next/font` todavía (porque falta el install).

## Decisión de fuente (Geist) — verificada contra el worktree

`next/font/google` expone la familia `Geist` en Next 15/16 (confirmado) y
`next/font` es compatible con `output: "export"` porque **auto-hospeda** la
fuente en tiempo de build (no hay request externo en runtime). Dos caminos:

- `next/font/google` con `Geist`: cero dependencias nuevas, primera parte, pero
  **descarga los archivos de fuente desde Google en tiempo de `next build`**
  (necesita red durante el build).
- Paquete `geist` (Vercel, primera parte, liviano): trae los archivos de fuente
  **empaquetados en local** (sin red en el build), expone `geist/font/sans`
  construido sobre `next/font/local`. Más robusto para builds offline/sandbox.

**Decisión:** usar el paquete `geist` como primario (robusto offline, alineado
con "sin recursos externos" de AGENTS.md), aplicando `GeistSans` en
`app/layout.tsx` sobre `<html>` y mapeándolo a Tailwind con una variable CSS.
Se fija versión exacta en `apps/web/package.json`.
**Si `npm install geist` o el build con Geist rompe el export estático
(`npm run -w apps/web build`): DETENERSE y reportar** (no forzar una fuente que
rompa SSG). Fallback documentado: `next/font/google` `Geist` si hay red en build.

## Tokens de color — valores y contraste AA (estimado; validación manual pendiente)

Ratios WCAG 2.1 aproximados: texto normal ≥ 4.5:1 (AA); texto grande / UI ≥ 3:1.

### Tema OSCURO (base, exactamente del Figma)

| Token | Valor | Par evaluado | Ratio AA estimado |
|---|---|---|---|
| `--bg` | `#0C0C0F` | fondo base | — |
| `--surface` | `#15151A` | superficie tarjeta/input | — |
| `--surface-2` / elevated | `#1D1D24` | elevado/badge | — |
| `--border` | `#292932` | borde (UI, no requiere 4.5) | sutil |
| `--brand` | `#8B5CF6` | fill de CTA | ver nota brand |
| `--brand-contrast` | `#FFFFFF` | texto sobre `--brand` | ~4.5:1 (VERIFICAR) |
| `--accent` (nuevo) | `#FACC15` | acento (no texto largo) | — |
| `--accent-contrast` (nuevo) | `#0C0C0F` | texto oscuro sobre `--accent` | ~12.7:1 |
| `--text` | `#F5F5F7` | sobre `--bg` | ~17.5:1 |
| `--text` | `#F5F5F7` | sobre `--surface` | ~16.6:1 |
| `--text` | `#F5F5F7` | sobre `--surface-2` | ~15.3:1 |
| `--text-muted` | `#A7A7B0` | sobre `--bg` | ~8.0:1 |
| `--focus` | `#8B5CF6` (o violet-400 claro) | anillo foco visible | ≥3:1 |

Notas de accesibilidad:
- El amarillo `#FACC15` NO se usa para texto largo sobre fondo oscuro. Solo como
  acento de detalle: bordes, pills, highlights, hover y texto oscuro sobre fill
  amarillo (badge/precio). `--accent-contrast` = `#0C0C0F` da ~12.7:1.
- Blanco sobre `--brand` `#8B5CF6` ≈ 4.5:1 (límite AA para texto normal).
  Marcar **"verificar en implementación"**: si no alcanza 4.5:1 con herramienta,
  oscurecer ligeramente el fill del CTA (p. ej. violet-600 `#7C3AED`) manteniendo
  `--brand` `#8B5CF6` como acento/borde.
- Estados danger/warning/success del tema oscuro: conservar los actuales (ya
  documentados AA) o re-derivar sobre `#0C0C0F` manteniendo ≥4.5:1.

### Tema CLARO (derivado coherente y accesible; se MANTIENE)

Conservar la estructura actual, mismo brand violeta, texto oscuro, y añadir el
acento amarillo con contraste de texto oscuro:

| Token | Valor claro | Par evaluado | Ratio AA estimado |
|---|---|---|---|
| `--bg` | `#FFFFFF` | fondo base | — |
| `--surface` | `#F8FAFC` | superficie | — |
| `--surface-2` | `#F1F5F9` | elevado/badge | — |
| `--border` | `#E2E8F0` | borde | sutil |
| `--brand` | `#6D28D9` | fill CTA, texto blanco | ~6.4:1 |
| `--brand-contrast` | `#FFFFFF` | sobre `--brand` | ~6.4:1 |
| `--accent` | `#FACC15` | acento | — |
| `--accent-contrast` | `#1C1917` | texto oscuro sobre acento | ~AA alto |
| `--text` | `#0F172A` | sobre `--bg` | ~16.9:1 |
| `--text-muted` | `#475569` | sobre `--bg` | ~7.5:1 |
| `--focus` | `#7C3AED` | anillo foco | ≥3:1 |

Nuevas utilidades en `@theme`: `--color-accent: var(--accent)` (genera
`bg-accent`/`text-accent`/`border-accent`) y `--color-accent-contrast:
var(--accent-contrast)` (`text-accent-contrast`).

## Tipografía y spacing (Figma)

- Familia: Geist (vía paquete `geist`, ver decisión).
- Escala: Display 48 Bold (títulos de home/detalle), Heading 24 SemiBold
  (nombre de evento / h1), Body 16 Regular (fecha/venue/ciudad/precio).
- Spacing: escala 4·8·12·16·24·32·48 (usar utilidades Tailwind equivalentes:
  gap-1/2/3/4/6/8/12, p-*, etc.). Nada de valores mágicos.
- Radios: inputs 8 (`rounded-lg`), botones 10 (`rounded-[10px]` o token), tarjetas
  12 (`rounded-xl`), pills full (`rounded-full`). Definir una convención única y
  documentarla; preferir utilidades estándar de Tailwind cuando el valor coincide.

## Secuencia de implementación (ordenada por dependencia)

- [ ] 1. Instalar dependencias y fijar la fuente Geist.
      Ejecutar `npm install` en la raíz del worktree. Añadir dependencia `geist`
      (versión exacta) en `apps/web/package.json` e instalar. Aplicar `GeistSans`
      en `app/layout.tsx` sobre `<html>` con su variable CSS; exponer la familia
      en `globals.css` vía `@theme` (`--font-sans: var(--font-geist-sans)` o
      equivalente) para que `font-sans` use Geist.
      Archivos: `apps/web/package.json`, `apps/web/app/layout.tsx`,
      `apps/web/app/globals.css`.
      Verify: `npm run -w apps/web build` completa el export estático sin error.
      Si rompe el export: DETENERSE y reportar (ver decisión de fuente).

- [ ] 2. Alinear tokens de color oscuro al Figma y añadir el acento amarillo.
      En `globals.css`: tema oscuro con los valores exactos del Figma (bg
      `#0C0C0F`, surface `#15151A`, surface-2 `#1D1D24`, border `#292932`, brand
      `#8B5CF6`, text `#F5F5F7`, text-muted `#A7A7B0`) en los tres bloques
      (`[data-theme='dark']` y el `@media`); mantener el tema claro coherente;
      añadir `--accent`/`--accent-contrast` en claro y oscuro y sus utilidades en
      `@theme`. Documentar ratios AA por par en comentarios.
      Archivos: `apps/web/app/globals.css`.
      Verify: `npm run -w apps/web build` ok y `npm run qa` (typecheck+lint+tests)
      en verde (los tests de tema no cambian de contrato).

- [ ] 3. Actualizar documentación de tokens.
      Reflejar en `docs/front-tokens-tema.md` los valores oscuros del Figma, el
      nuevo acento `--accent`/`--accent-contrast`, sus utilidades y los ratios AA
      estimados; nota de validación manual pendiente.
      Archivos: `docs/front-tokens-tema.md`.
      Verify: revisión del diff; `npm run lint` no aplica a .md, basta revisión.

- [ ] 4. Rediseñar `EventCard` (editorial, musical, ordenada).
      Nombre protagonista en Heading (24 SemiBold), afiche con aspect-ratio
      estable, fecha/venue/ciudad en Body/Muted, precio y disponibilidad claros,
      radios 12 (`rounded-xl`), superficie `--surface`/`--elevated` con `--border`
      sutil, estado y enlace a ticketera con su semántica actual intacta, foco
      visible, acento amarillo con mesura (p. ej. precio o badge). NO cambiar el
      overlay de navegación ni el CTA externo (href, target, rel, z-10).
      Archivos: `apps/web/components/EventCard.tsx`.
      Verify: `npm run -w apps/web build` ok; `npm run qa` en verde.

- [ ] 5. Rediseñar `EventList` / home.
      Encabezado editorial con Display para el título, buscador integrado, conteo
      total, ritmo vertical del sistema de spacing. MANTENER intacta la lógica de
      scroll infinito (IntersectionObserver, centinela, botón "Cargar más",
      snapshot/restauración, debounce, estados de carga/error/vacío). Solo cambia
      presentación (clases).
      Archivos: `apps/web/components/EventList.tsx`.
      Verify: `npm run -w apps/web build` ok; `npm run qa` en verde; `event-list-state.test.ts` sigue pasando.

- [ ] 6. Rediseñar detalles: `EventDetail`, `ArtistDetail`, `VenueDetail`.
      Misma jerarquía/espaciado/tipografía (h1 Heading/Display, Body/Muted),
      afiche protagonista con aspect-ratio estable, radios y acento consistentes.
      Conservar el enlace único "Ir a la ticketera" y "Ver ticketeras" cuando hay
      varias fuentes (semántica de `lib/format.ts` intacta). Mismo patrón de
      cambio en los tres archivos.
      Archivos: `apps/web/components/EventDetail.tsx`,
      `apps/web/components/ArtistDetail.tsx`, `apps/web/components/VenueDetail.tsx`.
      Verify: `npm run -w apps/web build` ok; `npm run qa` en verde.

- [ ] 7. Rediseñar layout, header, footer y corregir fallbacks fuera de token.
      Header sobrio con wordmark miShow (NO tocar el logo) + ThemeToggle; footer
      discreto; nav clara en móvil; contenedor y ritmo vertical del sistema.
      Reemplazar `text-neutral-500` por `text-text-muted` en los fallbacks de
      `Suspense` de las 3 páginas de detalle.
      Archivos: `apps/web/app/layout.tsx`, `apps/web/app/evento/page.tsx`,
      `apps/web/app/artistas/page.tsx`, `apps/web/app/venues/page.tsx`.
      Verify: `grep` no debe quedar `text-neutral-`; `npm run -w apps/web build` ok;
      `npm run qa` en verde.

- [ ] 8. QA final y verificación headless.
      `npm run qa` (typecheck + lint + tests) en verde; `npm run -w apps/web build`
      genera el export estático sin error. Verificación headless del export
      (servir `apps/web/out` y comprobar que home, /evento, /artistas, /venues
      cargan y el tema oscuro aplica por defecto donde corresponde).
      Archivos: ninguno (solo verificación).
      Verify: ambos comandos en verde; captura/registro de la verificación headless.

## QA y comandos (reales del proyecto)

- `npm run qa` (raíz) = `npm run typecheck && npm run lint && npm test`.
- `npm run -w apps/web build` = `next build` con `output: "export"`.
- Tests del front: `vitest run tests` en `apps/web` (via `npm test`).

## Requisitos reportados por el usuario — "verificar en implementación"

- "funciona en local / el merge está listo": NO asumir; verificar con build + QA
  y verificación headless en esta etapa.
- Tema oscuro por defecto: verificar comportamiento con el script anti-flash y
  `prefers-color-scheme` tras el cambio de tokens.
- Contraste blanco sobre `--brand` `#8B5CF6` ≈ 4.5:1: verificar con herramienta;
  ajustar fill del CTA si no alcanza AA.

## Commits temáticos (en español)

1. `chore(web): instala dependencias y añade fuente Geist (SSG)`
2. `feat(web): alinea tokens oscuros al Figma y añade acento amarillo`
3. `docs(web): actualiza tabla de tokens y acento en docs`
4. `feat(web): rediseña EventCard editorial manteniendo CTA y navegación`
5. `feat(web): rediseña home/EventList conservando scroll infinito`
6. `feat(web): rediseña detalles de evento, artista y recinto`
7. `feat(web): header/footer sobrios y corrige fallbacks fuera de token`
8. `test(web): QA final y verificación headless del export`
