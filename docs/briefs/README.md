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
