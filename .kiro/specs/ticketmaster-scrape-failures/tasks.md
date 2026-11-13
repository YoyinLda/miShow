# Implementation Plan

## Overview

Corrección de fallas de scrape de Ticketmaster: clasificación de bloqueos, validación semántica del listado, backoff con jitter, política de salida y diagnóstico. Sigue la metodología de condición de bug: exploración (Property 1), preservación (Property 2), implementación y validación. PuntoTicket no debe cambiar de comportamiento.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3"] },
    { "id": 4, "tasks": ["3.4"] },
    { "id": 5, "tasks": ["3.5"] },
    { "id": 6, "tasks": ["3.6"] },
    { "id": 7, "tasks": ["3.7", "3.8"] },
    { "id": 8, "tasks": ["3.9"] },
    { "id": 9, "tasks": ["4"] },
    { "id": 10, "tasks": ["5"] }
  ]
}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Fallas de scrape no clasificadas ni visibles
  - **CRITICAL**: Este test DEBE FALLAR en código sin corregir; el fallo confirma el bug
  - **NO intentar arreglar el test ni el código cuando falle**
  - **GOAL**: Surface counterexamples que demuestren el bug
  - **Scoped PBT Approach**: acotar la propiedad a casos concretos con transporte falso y `random`/`sleep` inyectables (sin red real), en `scrapers/ticketmaster/tests`
  - Casos (isBugCondition del diseño), con `resilience` activa y aserciones sobre Expected Behavior:
    - Listado 403 → esperado `blocked` con `http_status=403`, `stage=listing`, `attempts`, run `failed`
    - Redirección a `/queue` → esperado `blocked_redirect`/`challenge` conservando `source_url`
    - Listado HTML válido sin `div.grid_element` → esperado `listing_empty`, `status != succeeded`
    - 50% de detalles sin JSON-LD → esperado `partial` con `failure_breakdown` y `health: degraded`
    - Dos 503 → esperado delays con jitter dentro de rango y ≤ `maxRetryAfterMs`
    - `partial` → esperado política de salida D3 (`::warning::` / exit según `TM_FAIL_ON_PARTIAL`)
    - Falla global → esperado `stage`, `code`, `attempts` reales (no `global_acquisition_failure`/`attempts: 1`)
  - Ejecutar en código SIN corregir
  - **EXPECTED OUTCOME**: Test FALLA (correcto: prueba que el bug existe)
  - Documentar contraejemplos (p. ej. "403 → `http_error` sin status; 0 refs → `succeeded`")
  - Marcar completa cuando el test esté escrito, ejecutado y el fallo documentado
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Corridas sanas y PuntoTicket sin cambios
  - **IMPORTANT**: Seguir metodología observation-first
  - Verificar antes qué librería PBT usa el repo (fast-check o equivalente)
  - Observar en código SIN corregir con fixtures (`ticketmaster-listing.html`, `ticketmaster-detail-*.html`):
    - Corrida sana Ticketmaster: eventos, `source: ticketmaster`, `source_url`, `time_known`, `status = succeeded`
    - Idempotencia por `source_id` al reejecutar
    - Fecha date-only con `time_known: false` en `America/Santiago`; con hora, offset explícito
    - Límites: HTTPS, host, rutas bloqueadas, concurrencia ≤ 2, delay ≥ 1000 ms, timeout ≤ 30 s, ≤ 3 redirecciones, 2 MiB, `MAX_EVENTS`/`MAX_EVENTS_LIMIT`
    - Un evento fallido no detiene a los demás; errores en `scrape_run_errors` sin credenciales
    - PuntoTicket (sin `resilience`): 403 → `http_error`, 0 refs → `succeeded`, backoff 1000/2000 ms, `partial` con exit 0, mismo `runStatus`
  - Escribir property-based tests: para todo input con ¬isBugCondition o PuntoTicket, resultado igual al observado
  - Ejecutar en código SIN corregir
  - **EXPECTED OUTCOME**: Tests PASAN (confirma línea base a preservar)
  - Marcar completa cuando estén escritos, ejecutados y pasando
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 3. Fix for fallas de scrape de Ticketmaster (clasificación, umbrales, jitter, salida, diagnóstico)

  - [ ] 3.1 Agregar `ResilienceConfig` opt-in en `scrapers/core/src/acquisition/policy.ts`
    - Campos: `classifyBlocking`, `jitterRatio`, `minListingRefs`, `degradedRatio`, `failedRatio`; default `undefined` = comportamiento actual
    - Validar rangos (0–1, enteros ≥ 0) sin tocar límites duros
    - _Bug_Condition: isBugCondition(input) from design_
    - _Preservation: PuntoTicket no activa `resilience`_
    - _Requirements: 2.1, 2.4, 2.5, 3.3, 3.6_

  - [ ] 3.2 Clasificar bloqueos y backoff con jitter en `scrapers/core/src/acquisition/http.ts`
    - `HttpErrorCode`: `blocked` (401/403), `blocked_redirect`, `challenge`; `HttpAcquisitionError.httpStatus?`
    - Sin `classifyBlocking` mantener `http_error`/`redirect_rejected`/`invalid_content_type`
    - No reintentar 401/403; sí 408/429/5xx, timeout y red (D5)
    - `backoffMs(attempt, jitterRatio, random)` inyectable; sin jitter = valor actual
    - Respetar `Retry-After` ≤ `maxRetryAfterMs` y `delayMs` mínimo; no cambiar User-Agent/headers (D4)
    - _Bug_Condition: status IN {401,403} OR challenge/queue/blocked redirect OR transient sin jitter_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: límites de política y PuntoTicket idéntico_
    - _Requirements: 2.1, 2.2, 2.5, 3.3_

  - [ ] 3.3 Validación semántica y diagnóstico en `scrapers/core/src/acquisition/orchestrator.ts`
    - `ScrapeError.http_status?`; `globalFailure` conserva código, status y attempts (`ScrapeStageError`)
    - Con `resilience`: `listing_empty` (0 refs, falla global) y `listing_degraded` (< `minListingRefs`)
    - `summary.failure_breakdown` y `health: ok|degraded|failed` según `degradedRatio`/`failedRatio` (D1)
    - Conservar `source_url` del evento afectado, sin credenciales
    - _Bug_Condition: listing.ok AND references < MIN_LISTING_REFS; failureRatio > DEGRADED_RATIO_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Requirements: 2.2, 2.3, 2.4, 2.7, 3.5, 3.7_

  - [ ] 3.4 Estado y errores globales en `scrapers/core/src/persistence/workflow.ts`
    - `health=degraded` → `partial`; `health=failed` → `failed`; sin `health` usar `runStatus` actual
    - Catch global: registrar `stage`, `code`, `attempts` reales; fallback a `global_acquisition_failure`
    - Mensajes vía `sanitizePersistenceMessage`
    - _Preservation: idempotencia por `source_id`, PuntoTicket sin `health`_
    - _Requirements: 2.3, 2.4, 2.7, 3.2, 3.6_

  - [ ] 3.5 Activar `resilience` y política de salida en Ticketmaster
    - `scrapers/ticketmaster/src/acquisition/policy.ts` y `src/cli/ticketmaster-scrape.ts`: leer `TM_DEGRADED_RATIO`, `TM_FAILED_RATIO`, `TM_MIN_LISTING_REFS`, `TM_FAIL_ON_PARTIAL` con validación tipo `envInteger`
    - Exit 1 si `failed`; exit 1 si `partial` y `TM_FAIL_ON_PARTIAL=true`; `::warning::` en `partial` por defecto
    - No tocar el CLI de PuntoTicket
    - Valores D1–D3 siguen **OPEN** hasta aprobación TL/PO; implementar como defaults configurables
    - _Requirements: 2.4, 2.6, 3.6_

  - [ ] 3.6 Exponer variables en `.github/workflows/scrape-ticketmaster.yml`
    - Variables `TM_*` vía `vars.*` con defaults propuestos; sin secretos nuevos
    - _Requirements: 2.6_

  - [ ] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Fallas clasificadas y visibles
    - **IMPORTANT**: Re-ejecutar el MISMO test de la tarea 1; NO escribir uno nuevo
    - **EXPECTED OUTCOME**: Test PASA (confirma bug corregido)
    - Añadir PBT de fix-checking: delay ∈ [`delayMs`, `maxRetryAfterMs`]; `succeeded` nunca con N=0 refs; monotonía de `health` ante más fallas; sin credenciales en mensajes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Corridas sanas y PuntoTicket sin cambios
    - **IMPORTANT**: Re-ejecutar los MISMOS tests de la tarea 2; NO escribir nuevos
    - Incluye corrida PuntoTicket completa con fixtures: salida, códigos de error, `runStatus` y exit code idénticos a la línea base
    - **EXPECTED OUTCOME**: Tests PASAN (sin regresiones)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ] 3.9 Tests unitarios e integración
    - Unit: `getHtml` (401/403 sin reintento, 429/503 con `Retry-After`, `Content-Type` ausente), `scrape` (0 refs, bajo mínimo, `health` en bordes 0.25/0.75), workflow (forzado por `health`), CLI (`TM_FAIL_ON_PARTIAL`, `TM_*` inválidas)
    - Integración con persistencia en memoria: listado 403 → run `failed` con `blocked` en `scrape_run_errors`; corrida mixta → `partial` con eventos válidos persistidos
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 3.5_

- [ ] 4. Actualizar documentación
  - Actualizar `docs/`: contrato de códigos de error (`blocked`, `blocked_redirect`, `challenge`, `listing_empty`, `listing_degraded`, `degraded_details`), campos `http_status`/`attempts`/`failure_breakdown`/`health`, variables `TM_*` y política de salida
  - Documentar decisiones D1–D5 y su estado de aprobación TL/PO
  - Confirmar que no hay secretos ni credenciales en docs/workflow
  - _Requirements: 2.6, 2.7_

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ejecutar typecheck, lint y tests (scripts del `package.json` raíz) para `scrapers/core`, `scrapers/ticketmaster` y `scrapers/puntoticket`
  - Revisar diff: solo cambios previstos, PuntoTicket sin modificaciones de comportamiento
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas 1 y 2 se ejecutan sobre código sin corregir; la 1 debe fallar y la 2 debe pasar.
- Las decisiones D1–D5 siguen OPEN hasta aprobación TL/PO; se implementan como defaults configurables.
- Sin secretos ni credenciales; sin red real en tests (transporte falso, `random`/`sleep` inyectables).
- PuntoTicket no activa `resilience` y debe permanecer idéntico.
