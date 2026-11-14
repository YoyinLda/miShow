# Brief 006 — Front fiel al Figma (marca, Home y Catálogo)

Estado: entregas 1–3 implementadas. PR #27 (1, `feat/front-marca-header`), #28 (2, `feat/front-home`), entrega 3 en `feat/front-catalogo`. Cada PR parte del anterior.

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

### 1. Marca y header — hecho (PR #27)
- Logo vectorial en `components/brand/Logo.tsx` (tokens `--logo-mi` / `--logo-show`).
- Header desktop desde `lg`: nav Medium 14, buscador único 360×44 (radio 10), sin borde.
- Header mobile: logo 28 px, iconos ⌕ / ☰.
- Selector de tema: panel tras ◐ (desktop) y dentro de ☰ (mobile).
- Favicon `app/icon.svg` (App Icon, Theme=Dark).
- QA (2026-11-13): typecheck, lint, tests web y build OK; revisión visual 390/1440 en claro y oscuro OK. `npm run qa` falla solo por los tests `ticketmaster-scrape-failures.bug-condition` del scraper, que ya fallan en `main` (WIP, ajeno al front).
- Decisión abierta: el header del Figma usa el logo sin sombrero (13:50); el Bloque aprobado lo lleva sobre la "o".

### 2. Home — hecho (rama `feat/front-home`)
- Hero desktop (`lg`+) sin buscador: "Encuentra algo que valga la pena ver en vivo" + "Conciertos, tocatas y experiencias musicales en Chile." Mobile mantiene "Música en vivo, planes reales" con buscador.
- Chips desktop: Hoy, Esta semana, Este mes, Gratis, + Filtros (→ `/eventos?filtros=abrir`, abre el panel de filtros). Mobile: Hoy, Semana, Mes, Gratis.
- Decisión TL/PO: "Santiago" y "Rock" quedan fuera hasta tener el dato (la ciudad viene por comuna; los eventos no traen género).
- Títulos de sección SemiBold 600 (22 mobile / 24 desktop); descripción o conteo a la derecha solo desde `lg`, como el Figma. "Próximos conciertos" muestra el total real (`formatEventCount`, p. ej. "282 eventos"); con "Gratis" no se muestra (post-filtro cliente).
- EventRow: mobile título en 2 líneas, imagen 48×56 y precio bajo el venue (decisión TL/PO; el Figma lo oculta); desktop imagen 72×52 y precio antes de la flecha.

### 3. Secciones y Catálogo — hecho (rama `feat/front-catalogo`)
- Escena local e Historias ocultas (y sus enlaces del header) tras `SHOW_EDITORIAL_SECTIONS` en `lib/sections.ts` (decisión TL/PO): sin dato real no se muestran placeholders. Al activarlas, rehacer las tarjetas chicas del Figma (2 columnas en mobile).
- Destacados: mini cards con imagen del evento (16:9, placeholder si no hay); grilla desktop 520/380/380 como el Figma.
- `/eventos`: título 34/48 y subtítulo "Encuentra tu próximo concierto."; en desktop el buscador queda solo en el header (salvo si se llega con `?q=`) y "Filtros" pasa a chip "+ Filtros" con contador; en mobile se mantiene el botón Filtros (decisión TL/PO). "Todos los eventos" lleva el conteo al lado desde `lg`.

## Ideas por decidir (TL/PO)
- Filtrar eventos que no son música (p. ej. partidos de fútbol en Claro Arena).

## Forma de trabajo
- Una rama y un PR por entrega, partiendo de la anterior.
- Implementar desde `get_design_context` del nodo correspondiente, reutilizando tokens y componentes de `components/ui`.
- Verificar con `npm run qa` y build antes de abrir el PR.
