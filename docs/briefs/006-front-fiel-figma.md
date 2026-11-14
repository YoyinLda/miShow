# Brief 006 — Front fiel al Figma (marca, Home y Catálogo)

Estado: en curso. Entrega 1 en PR #27 (rama `feat/front-marca-header`).

## Objetivo

Alinear `apps/web` con el diseño de Figma sin perder funcionalidad (búsqueda,
filtros por rango, scroll infinito, tema claro/oscuro/sistema).

## Fuente de diseño

Figma `TJO1DJlVF1xfcP9QKWTR7g` ("miShow — UX/UI Reference"):

| Página | Nodo | Contenido |
|---|---|---|
| 01 Foundations | `0:1` | Colores (ya en `globals.css`), Geist (Display 48 Bold, Heading 24 SemiBold, Body 16 Regular), spacing 4·8·12·16·24·32·48, radios 8 inputs · 10 botones · 12 cards · full pills |
| 02 Components | `1:2` | FilterChip `2:5`, Button/Primary `2:7`, EventRow `2:9`, FeaturedEventCard `2:20`; marca: Logo Horizontal `13:179`, App Icon `13:181`, Bloque aprobado `16:270` |
| 03 Screens | `1:3` | Home Desktop `3:2`, Home Mobile `3:123`, Catálogo Desktop `10:175`, Catálogo Mobile `10:332` |

## Entregas

### 1. Marca y header — hecho (PR #27), falta QA
- Logo vectorial en `components/brand/Logo.tsx` (tokens `--logo-mi` / `--logo-show`).
- Header desktop desde `lg`: nav Medium 14, buscador único 360×44 (radio 10), sin borde.
- Header mobile: logo 28 px, iconos ⌕ / ☰.
- Selector de tema: panel tras ◐ (desktop) y dentro de ☰ (mobile).
- Favicon `app/icon.svg` (App Icon, Theme=Dark).
- Pendiente: `npm run qa`, `npm run build -w @mishow/web`, revisión visual 390/1440 en claro y oscuro.
- Decisión abierta: el header del Figma usa el logo sin sombrero (13:50); el Bloque aprobado lo lleva sobre la "o".

### 2. Home — pendiente
- Hero desktop sin buscador: "Encuentra algo que valga la pena ver en vivo" + "Conciertos, tocatas y experiencias musicales en Chile." En mobile se mantiene "Música en vivo, planes reales" con buscador.
- Chips: 7 en desktop (Hoy, Esta semana, Este mes, Gratis, Santiago, Rock, + Filtros) y 4 en mobile (Hoy, Semana, Mes, Gratis).
- Títulos de sección SemiBold 600 con descripción o conteo a la derecha (p. ej. "152 eventos").
- EventRow mobile: título en 2 líneas, imagen 48×56, precio visible.

### 3. Secciones y Catálogo — pendiente
- Escena local: tarjetas chicas (nombre, fecha en acento, género), 2 columnas en mobile.
- Destacados: imagen del evento en las mini cards.
- `/eventos` según frames Catálogo.

## Ideas por decidir (TL/PO)
- Ocultar Escena local e Historias mientras solo muestren "Próximamente".
- Filtrar eventos que no son música (p. ej. partidos de fútbol en Claro Arena).
- Mostrar precio en mobile (el Figma lo oculta).

## Forma de trabajo
- Una rama y un PR por entrega, partiendo de la anterior.
- Implementar desde `get_design_context` del nodo correspondiente, reutilizando tokens y componentes de `components/ui`.
- Verificar con `npm run qa` y build antes de abrir el PR.
