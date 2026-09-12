# Instrucciones para agentes — miShow

Un agente único (`mishow`) detecta contexto de la tarea y actúa según rol necesario (diseño, dev, QA, datos).

## Contexto

miShow: conciertos/eventos múltiples fuentes. Mobile-first, música Chile.

## Stack

TypeScript, Next.js, React, Tailwind, AWS Lambda/RDS, SQS, EventBridge, Playwright/Puppeteer, SES, W3C Trace Context.

## Cómo trabajar

TL/PO describe la tarea naturalmente. El agente detecta automáticamente si necesita diseñar, implementar, validar o tocar BD.

- **Diseño:** "Especifica flujo para..." → Agente genera specs, no edita código.
- **Desarrollo:** "Implementa..." → Agente edita código con pruebas.
- **QA:** "Valida cambios..." → Agente verifica, no corrige código.
- **Datos:** "Migra BD..." → Agente maneja Supabase, RLS, migraciones.

## Reglas globales

- Si falta decisión sobre comportamiento, modelo, costo o arquitectura: detente (TL/PO decide).
- Pruebas cuando cambia comportamiento. Ejecuta: typecheck, lint, tests.
- Sin secretos, tokens, credenciales. No despliegues, no recursos externos, no cobros.
- Actualiza docs/ si cambia contrato, arquitectura, proceso.
- Cambios pequeños, reversibles. Reutiliza tipos/contratos.

## Flujo

TL/PO → tarea descrita → agente detecta contexto → diseño aprobado → implementación → QA → cierre.

Evita ediciones concurrentes. Agente pausa para aprobación TL/PO entre fases cuando sea necesario.

## Criterios del producto

- Mobile-first, accesible, performante.
- Conserva fuente y URL original cada evento.
- Ingesta idempotente, tolera reintentos.
- Scrapers respetan límites, bloqueos, condiciones fuente.
- Fechas/horas: zona horaria explícita.
- Detecta duplicados entre fuentes.

## Definición de terminado

Implementada, pruebas, sin secretos, documentación actualizada, diff claro.

