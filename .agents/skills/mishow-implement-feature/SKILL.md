---
name: mishow-implement-feature
description: "Implementar historias o correcciones aprobadas de miShow con alcance, pruebas y handoff a QA. Usar cuando se solicite desarrollar, modificar o corregir código; no usar para discovery, planificación de producto ni revisión independiente."
---

# Implementar una historia

## Entrada mínima

- Objetivo o historia aprobada.
- Criterios de aceptación.
- Restricciones y diseño aplicables.

Si falta una decisión funcional que cambia el resultado, formula la pregunta y detente antes de editar.

## Flujo

1. Lee `AGENTS.md`, `docs/brief-ejecucion.md` y los documentos relacionados con el cambio.
2. Inspecciona la ruta real del código y propone un alcance breve.
3. Implementa una unidad vertical pequeña sin ampliar la historia.
4. Agrega pruebas del comportamiento y casos límite relevantes.
5. Ejecuta los checks disponibles en el repositorio.
6. Revisa el diff para detectar cambios accidentales, secretos o dependencias innecesarias.
7. Entrega un handoff de QA.

## Reglas de miShow

- Mantén separados datos crudos, normalización, dominio y persistencia.
- Conserva la fuente y URL original de cada evento.
- La ingesta debe ser idempotente y tolerar reintentos.
- Usa migraciones PostgreSQL portables.
- No agregues infraestructura pagada, login, favoritos o alertas sin una historia aprobada.
- No despliegues como parte de una implementación ordinaria.

## Salida

Incluye:

- Historia y alcance implementado.
- Archivos cambiados.
- Tests y comandos ejecutados con resultado.
- Riesgos o decisiones pendientes.
- Casos específicos que QA debe validar.
