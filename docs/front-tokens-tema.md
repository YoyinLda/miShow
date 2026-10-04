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

| Token | Utilidad | Claro | Oscuro | Ratio AA (contexto) |
|---|---|---|---|---|
| `--bg` | `bg-bg` | `#ffffff` | `#0b1020` | fondo base |
| `--surface` | `bg-surface` | `#f8fafc` | `#141a2e` | superficie de tarjetas/inputs |
| `--surface-2` | `bg-surface-2` | `#f1f5f9` | `#1e2639` | placeholders y badges neutros |
| `--text` | `text-text` | `#0f172a` | `#e5e7eb` | ~16.9:1 claro / ~13.4:1 oscuro |
| `--text-muted` | `text-text-muted` | `#475569` | `#9aa4b8` | ~7.5:1 claro / ~6.6:1 oscuro |
| `--border` | `border-border` | `#e2e8f0` | `#2a3350` | borde (UI, ≥3:1 no requerido) |
| `--focus` | `ring-focus` | `#7c3aed` | `#a78bfa` | anillo de foco visible |
| `--brand` | `bg-brand` / `text-brand` | `#6d28d9` | `#a78bfa` | relleno de CTA / acento |
| `--brand-contrast` | `text-brand-contrast` | `#ffffff` | `#1e1b2e` | ~6.4:1 claro / ~7.0:1 sobre `--brand` |
| `--brand-surface` | `bg-brand-surface` | `#f5f3ff` | `#241b3a` | fondo suave de badge de marca |
| `--danger` | `text-danger` / `bg-danger` | `#b91c1c` | `#f87171` | ~6.3:1 claro / ~5.9:1 oscuro |
| `--danger-contrast` | `text-danger-contrast` | `#ffffff` | `#1a0b0b` | texto sobre `--danger` |
| `--danger-surface` | `bg-danger-surface` | `#fef2f2` | `#2a1414` | fondo del aviso de error |
| `--warning` | `text-warning` / `bg-warning` | `#b45309` | `#fbbf24` | ~5.0:1 claro / ~9.9:1 oscuro |
| `--warning-contrast` | `text-warning-contrast` | `#ffffff` | `#201501` | texto sobre `--warning` |
| `--warning-surface` | `bg-warning-surface` | `#fffbeb` | `#2a2109` | fondo del aviso "no configurado" |
| `--success` | `text-success` / `bg-success` | `#15803d` | `#4ade80` | ~5.2:1 claro / ~9.0:1 oscuro |
| `--success-contrast` | `text-success-contrast` | `#ffffff` | `#06130a` | texto sobre `--success` |
| `--success-surface` | `bg-success-surface` | `#f0fdf4` | `#0f2417` | fondo de aviso de éxito |

## Notas

- La utilidad del token `--color-text-muted` es `text-text-muted` (prefijo
  `text-` + nombre de token `text-muted`), tal como la genera Tailwind v4.
- Los ratios son aproximados y se documentan junto a cada par en
  `apps/web/app/globals.css`. La validación completa de accesibilidad requiere
  pruebas manuales con lectores de pantalla y revisión experta.
- Rediseño de jerarquía y densidad de tarjetas: Etapa 4 (ver Brief 005). Donde el
  resultado se ve pobre pero legible queda anotado `// TODO Etapa 4` sin
  rediseñar en esta etapa.
