# Instrucciones para agentes — miShow

## Contexto

miShow: conciertos/eventos múltiples fuentes. Mobile-first, música Chile.

## Stack

TypeScript, Next.js, React, Tailwind, AWS Lambda/RDS, SQS, EventBridge, Playwright/Puppeteer, SES, W3C Trace Context.

## Reglas globales

- **Cambios pequeños, reversibles.** Si falta decisión que afecte comportamiento, modelo, costo o arquitectura: detente (TL/PO decide).
- **Pruebas:** cuando cambia comportamiento. Ejecuta: typecheck, lint, tests.
- **Sin riesgos:** no secretos, tokens, credenciales. No despliegues, no recursos externos, no cobros.
- **Documentación:** actualiza `docs/` si cambia contrato, arquitectura, proceso.
- **Reutiliza:** tipos, contratos. Evita duplicar modelos.

## Equipo

- **TL/PO** (Rodrigo + principal): decisión final, alcance, autenticación producto.
- **designer**: especificaciones UX/UI, lectura solo. MVP: catálogo, búsqueda, filtros, detalle.
- **dev**: implementa historias aprobadas. Modifica código producto.
- **qa**: validación independiente, evidencia.
- **supabase**: migraciones, RLS, schemas (para historias BD).

## Flujo de trabajo

TL/PO → diseño aprobado → dev → qa → cierre TL/PO.

Evita ediciones concurrentes mismos archivos. Pausa ciclo para aprobación TL/PO después diseño, antes implementar.

## Criterios del producto

- Mobile-first, accesible, performante.
- Conserva fuente y URL original cada evento.
- Ingesta idempotente, tolera reintentos.
- Scrapers respetan límites, bloqueos, condiciones fuente.
- Fechas/horas: zona horaria explícita.
- Detecta duplicados entre fuentes.

## Definición de terminado

Implementada, pruebas, sin secretos, documentación actualizada, diff claro.

