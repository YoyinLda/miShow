# Briefs de investigación y tareas

Este folder contiene los **briefs** de planificación de tareas de miShow. Cada
brief documenta una investigación previa, la solución propuesta y un **checklist
de tareas con su estado**, que se va marcando a medida que se ejecuta.

## Convención

- Un archivo por tarea/iniciativa: `NNN-nombre-corto.md` (numeración incremental).
- Todo brief debe incluir, como mínimo:
  1. **Contexto / problema** — qué se quiere resolver y por qué.
  2. **Investigación** — hallazgos verificados (no supuestos).
  3. **Decisiones** — lo acordado con TL/PO y las alternativas descartadas.
  4. **Solución propuesta** — diseño de los cambios.
  5. **Checklist de tareas** — con estado `[ ]` pendiente / `[x]` hecho.
  6. **Verificación** — cómo se comprueba (typecheck, lint, tests, prueba live).
- El brief se escribe **antes** de ejecutar, para que TL/PO lo valide.
- A medida que se ejecuta cada tarea, se marca su casilla y se anota evidencia.

## Índice

| Brief | Estado | Descripción |
|---|---|---|
| [001-fuente-ticketmaster.md](001-fuente-ticketmaster.md) | Completado (10/10) | Segunda fuente (Ticketmaster) y arquitectura multi-fuente del scraping. |
| [002-correcciones-ticketmaster.md](002-correcciones-ticketmaster.md) | Completado (7/7) | Correcciones Ticketmaster: imagen (og:image), precios faltantes (límite de fuente) y documentación. |
| [003-modelo-canonico-eventos.md](003-modelo-canonico-eventos.md) | Completado | V1 Etapa 2A (P0): modelo canónico Event/EventSource/Performance/Artist/Venue + deduplicación multi-fuente (reescritura de esquema, destructiva + re-scrape). Frontend queda no funcional hasta brief de migración a catalog_events_v2. |
| [004-frontend-v2-artist-venue.md](004-frontend-v2-artist-venue.md) | Completado | V1 Etapa 2B (P0): frontend restaurado sobre catalog_events_v2 + páginas de Artista y Venue (rutas por slug vía query param, SSG). Filtros/home quedan para el brief 005. |
| [004-migracion-entorno-windows.md](004-migracion-entorno-windows.md) | Completado (9/9) · RFC tardío | Migración del entorno a Windows: nvm/PATH, CI a Node 24 + actions v5, tests CLI portables, secrets de Actions y MCP (Codebase Memory, Supabase vía PAT). |
| [005-mejoras-front-fechas-paginacion-visual.md](005-mejoras-front-fechas-paginacion-visual.md) · [plan](005-plan-implementacion-front.md) | Etapas 1-4 completadas (en producción) | Mejoras del front: hora desconocida (solo fecha), scroll infinito keyset, modo oscuro + tokens, y rediseño fiel a Figma 03 Screens (Home + Catálogo). Filtros avanzados → etapa 5. |
| [005-etapa5-filtros.md](005-etapa5-filtros.md) | Propuesta (pendiente TL/PO) | Etapa 5: filtros avanzados en `/eventos` (fuente, ciudad/recinto, estado) en bottom sheet mobile-first, con chips activos, conteo y combinación vacía. |
