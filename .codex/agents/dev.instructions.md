---
applyTo: "**"
description: "Contextual development rules for miShow agente único: design, development, QA, and Supabase workflows"
---

# Contextual Development Rules

Aplica globalmente. Agente detecta contexto de la solicitud e invoca reglas pertinentes.

## Diseño (si tarea es UX/UI spec)

- Entrega specs, no edites código.
- Lee TL/PO: problema, usuario, contexto, métrica.
- MVP: música Chile, catálogo/búsqueda/filtros/detalle. Sin features sin aprobación.
- Mobile-first, accesible, liviano. Reutiliza patrones.
- Define: jerarquía, contenido, estados, interacción, responsive, a11y, criterios visuales.
- Señala supuestos. Preguntas abiertas.

## Desarrollo (si tarea es implementación)

- Cambio mínimo, separado (extracción/normalización/persistencia/presentación).
- Si falta decisión: detente. TL/PO decide.
- Pruebas si cambia comportamiento.
- Ejecuta: typecheck, lint, tests. Revisa diff: secretos, permisos, costo.
- No despliegues, no credenciales productivas.
- Entrega: resumen, archivos, verificaciones, supuestos, handoff QA.

## QA (si tarea es validación)

- No corrijas código. Lee historia, diff, handoff dev.
- Verifica: comportamiento, límites, regresiones, a11y, seguridad, idempotencia, fallas.
- Hallazgo: severidad, evidencia, pasos, esperado vs actual, área.
- Veredicto: APROBADO, CON OBSERVACIONES, RECHAZADO + cobertura + riesgos + recomendación.

## Supabase/PostgreSQL (si tarea toca BD)

- Lectura primero: schema actual, extensiones, RLS, índices.
- Migraciones: pequeñas, versionadas (timestamp), idempotentes, reversibles.
- RLS: explícito en toda tabla API. Por defecto DENY. Escribe tests.
- Schema: tipos portables (smallint, integer, text, timestamp with time zone). Zona horaria explícita.
- Índices y foreign keys justificados, documentados.
- Consulta MCP Supabase en lectura. Confirma proyecto antes de escribir.
- Ejecuta: `supabase db reset && npm run tests` localmente.
- No despliegues a producción. No credenciales productivas.
- Entrega: objetivo, archivos/migraciones, verificaciones, supuestos, riesgos.

## Reglas globales (todas las tareas)

- Si falta decisión sobre comportamiento, modelo, costo o arquitectura: detente.
- Pruebas cuando cambia comportamiento.
- Sin secretos, tokens, credenciales. No despliegues, no recursos externos, no cobros.
- Actualiza docs/ si cambia contrato, arquitectura, proceso.
- Cambios pequeños, reversibles. Reutiliza tipos/contratos.
