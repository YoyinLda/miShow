# Tokens de tema del front (claro / oscuro)

Sistema de color semántico de `apps/web` (Tailwind v4). Un único set de
utilidades: el tema cambia los valores de las variables, no las clases por
pantalla. Fuente de verdad: `apps/web/app/globals.css`.

## Estrategia de override

- `:root` define el tema **claro** (default).
- `[data-theme='dark']` fuerza **oscuro** (el atributo manda).
- `@media (prefers-color-scheme: dark)` restringido a `:root:not([data-theme])`
  sigue al sistema **solo** cuando no hay atributo (elección "sistema").
- El toggle (`components/ThemeToggle.tsx`) escribe la elección en `localStorage`
  (clave `mishow-theme`) y aplica/quita `data-theme`; un script anti-flash en
  `layout.tsx` lo aplica antes del paint.

## Tabla de tokens

Ratios de contraste objetivo (WCAG 2.1): texto normal ≥ 4.5:1 (AA); texto
grande / componentes de UI ≥ 3:1 (AA). Los ratios de texto se evalúan sobre
`--bg`; los de contraste de marca/estado, sobre su color de relleno.

El tema **oscuro** usa los valores **exactos del Figma Foundations** (es la base
del sistema). El tema claro se mantiene coherente y accesible.

| Token | Utilidad | Claro | Oscuro | Ratio AA (contexto) |
|---|---|---|---|---|
| `--bg` | `bg-bg` | `#ffffff` | `#0c0c0f` | fondo base |
| `--surface` | `bg-surface` | `#f8fafc` | `#15151a` | superficie de tarjetas/inputs |
| `--surface-2` | `bg-surface-2` | `#f1f5f9` | `#1d1d24` | placeholders y badges neutros |
| `--text` | `text-text` | `#0f172a` | `#f5f5f7` | ~16.9:1 claro / ~17.5:1 oscuro (sobre `--bg`) |
| `--text-muted` | `text-text-muted` | `#475569` | `#a7a7b0` | ~7.5:1 claro / ~8.0:1 oscuro |
| `--border` | `border-border` | `#e2e8f0` | `#292932` | borde (UI, ≥3:1 no requerido) |
| `--focus` | `ring-focus` | `#7c3aed` | `#8b5cf6` | anillo de foco visible (≥3:1) |
| `--brand` | `bg-brand` / `text-brand` | `#6d28d9` | `#8b5cf6` | relleno de CTA / marca |
| `--brand-contrast` | `text-brand-contrast` | `#ffffff` | `#ffffff` | ~6.4:1 claro / ~4.5:1 oscuro (límite AA) sobre `--brand` |
| `--brand-surface` | `bg-brand-surface` | `#f5f3ff` | `#241b3a` | fondo suave de badge de marca |
| `--accent` | `bg-accent` / `text-accent` | `#facc15` | `#facc15` | acento amarillo (solo acento, ver nota) |
| `--accent-contrast` | `text-accent-contrast` | `#1c1917` | `#0c0c0f` | ~13.2:1 claro / ~13.6:1 oscuro sobre `--accent` |
| `--danger` | `text-danger` / `bg-danger` | `#b91c1c` | `#f87171` | ~6.3:1 claro / ~5.9:1 oscuro |
| `--danger-contrast` | `text-danger-contrast` | `#ffffff` | `#1a0b0b` | texto sobre `--danger` |
| `--danger-surface` | `bg-danger-surface` | `#fef2f2` | `#2a1414` | fondo del aviso de error |
| `--warning` | `text-warning` / `bg-warning` | `#b45309` | `#fbbf24` | ~5.0:1 claro / ~9.9:1 oscuro |
| `--warning-contrast` | `text-warning-contrast` | `#ffffff` | `#201501` | texto sobre `--warning` |
| `--warning-surface` | `bg-warning-surface` | `#fffbeb` | `#2a2109` | fondo del aviso "no configurado" |
| `--success` | `text-success` / `bg-success` | `#15803d` | `#4ade80` | ~5.2:1 claro / ~9.0:1 oscuro |
| `--success-contrast` | `text-success-contrast` | `#ffffff` | `#06130a` | texto sobre `--success` |
| `--success-surface` | `bg-success-surface` | `#f0fdf4` | `#0f2417` | fondo de aviso de éxito |

## Acento amarillo (`--accent`)

- Utilidades generadas por Tailwind v4: `bg-accent`, `text-accent`,
  `border-accent` (fill), y `text-accent-contrast` para el texto sobre el acento.
- **Uso restringido:** el amarillo `#FACC15` es solo acento (borde, pill,
  highlight, hover) o fill con texto oscuro encima. **Nunca** como color de texto
  largo sobre fondo oscuro (contraste insuficiente). El par accesible es texto
  `--accent-contrast` sobre fondo `--accent` (~13:1).

## Tipografía

- Familia **Geist** vía el paquete `geist` (versión exacta `1.7.2`), auto-hospedada
  mediante `next/font` (offline-safe, compatible con `output: 'export'`).
- `GeistSans` se importa en `layout.tsx` desde `geist/font/sans`; su `.variable`
  (`--font-geist-sans`) se aplica en el `<html>`.
- `globals.css` mapea `--font-sans: var(--font-geist-sans), ...` en `@theme`, así
  la utilidad `font-sans` usa Geist. El `body` aplica `font-sans`.

## Notas

- La utilidad del token `--color-text-muted` es `text-text-muted` (prefijo
  `text-` + nombre de token `text-muted`), tal como la genera Tailwind v4.
- Los ratios son aproximados y se documentan junto a cada par en
  `apps/web/app/globals.css`. La validación completa de accesibilidad requiere
  pruebas manuales con lectores de pantalla y revisión experta.
- Rediseño de jerarquía y densidad de tarjetas: Etapa 4 (ver Brief 005). Donde el
  resultado se ve pobre pero legible queda anotado `// TODO Etapa 4` sin
  rediseñar en esta etapa.
