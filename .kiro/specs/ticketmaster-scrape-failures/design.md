# Ticketmaster Scrape Failures Bugfix Design

## Overview

Los scrapeos de Ticketmaster Chile fallan de forma intermitente y, cuando degradan, el workflow queda en verde. Hay 7 defectos: bloqueos 401/403 sin clasificar (1.1), desafíos/colas/redirecciones indistinguibles (1.2), listado con 0 referencias marcado `succeeded` (1.3), sin umbral de degradación por fallas de parseo (1.4), backoff lineal sin jitter (1.5), `partial` con exit 0 (1.6) y diagnóstico global pobre (1.7).

Estrategia: cambios mínimos en `scrapers/core` (compartido con PuntoTicket), todos **opt-in mediante una configuración `resilience`** cuyo default es "comportamiento actual". Solo `scrapers/ticketmaster` (adapter/CLI/workflow de GitHub) activa los nuevos valores. Así PuntoTicket queda byte a byte igual. No se elude ningún bloqueo: se clasifica, se reintenta de forma acotada y se reporta.

## Glossary

- **Bug_Condition (C)**: Corrida de scrape donde ocurre alguno de: bloqueo 401/403, desafío/cola/redirección bloqueada, listado válido con 0 refs, ratio de fallas de detalle > umbral, reintentos transitorios agotados sin jitter, o `partial`/`failed` con exit 0.
- **Property (P)**: La corrida expone un código específico, etapa, HTTP status y intentos; no queda `succeeded` con 0 refs; y la degradación es visible en el exit code.
- **Preservation**: Comportamiento actual para corridas sanas, límites de política, idempotencia por `source_id`, zona horaria y todo el flujo de PuntoTicket.
- **`HttpClient.getHtml`** (`scrapers/core/src/acquisition/http.ts`): cliente HTTP con límites, reintentos y redirecciones; lanza `HttpAcquisitionError`.
- **`scrape`** (`scrapers/core/src/acquisition/orchestrator.ts`): orquesta listado + detalles; devuelve `ScrapeResult`.
- **`executePersistedScrape`** (`scrapers/core/src/persistence/workflow.ts`): persiste la corrida y calcula `status` (`runStatus`).
- **`ResilienceConfig`** (nuevo): opciones opt-in de clasificación de bloqueo, jitter, umbrales y salida.
- **Run degradada**: corrida `partial` o `failed` según los umbrales.

## Bug Details

### Bug Condition

El bug se manifiesta cuando la fuente bloquea, cambia su HTML o degrada, o cuando hay fallas transitorias. `HttpClient` solo emite `http_error` genérico para 4xx, `redirect_rejected`/`invalid_content_type` sin señal de bloqueo, el backoff es `attempt * 1000` sin jitter; `scrape` no valida `references.length`; `runStatus` solo mira conteos; el CLI solo sale con 1 si `failed`; y `executePersistedScrape` registra `global_acquisition_failure` con el mensaje truncado.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type ScrapeRun
  OUTPUT: boolean

  RETURN X.listing.status IN {401, 403}
      OR X.detail.status IN {401, 403}
      OR X.response.isChallengeOrQueueOrBlockedRedirect
      OR (X.listing.ok AND X.listing.references < MIN_LISTING_REFS)
      OR (X.attemptedDetails > 0 AND X.detail.failureRatio > DEGRADED_RATIO)
      OR (X.transientFailure AND X.retriesUsedWithoutJitter)
      OR (X.status IN {"partial","failed"} AND X.exitCode = 0)
      OR (X.globalFailure AND NOT hasDiagnostics(X.error, {stage, httpStatus, attempts}))
END FUNCTION
```

### Examples

- Listado responde 403: hoy `http_error "HTTP 403."` sin `http_status`; esperado `blocked` con `http_status=403`, `stage=listing`, `attempts`, corrida `failed`.
- Detalle redirige a `/queue/...`: hoy `redirect_rejected`; esperado `blocked_redirect`/`challenge` conservando `source_url` del evento.
- Cambio de selector `div.grid_element a[href*='/event/']`: hoy `succeeded` con 0/0; esperado `failed` con `listing_empty`.
- 30 de 60 detalles sin JSON-LD válido y 30 OK: hoy `partial` exit 0; esperado `partial` con `parse_failures` agrupado y exit ≠ 0 según política.
- 503 transitorio dos veces: hoy reintento a 1 s y 2 s exactos; esperado backoff con jitter acotado, respetando `Retry-After` ≤ `maxRetryAfterMs`.
- Borde: 0 referencias en PuntoTicket: comportamiento actual (sin cambio).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Corridas con 2xx HTML + JSON-LD válido extraen, normalizan y persisten con `source: ticketmaster` y `source_url` original.
- Persistencia idempotente por `source_id`; reintentos no duplican.
- Política: HTTPS, host `www.ticketmaster.cl`, rutas bloqueadas, concurrencia ≤ 2, delay ≥ 1000 ms (default 1500), timeout ≤ 30 s, ≤ 3 redirecciones, 2 MiB por HTML.
- Detalle sin hora: fecha date-only, `time_known: false`, `America/Santiago`; con hora, offset explícito.
- Un evento fallido no detiene a los demás; errores por evento en `scrape_run_errors` sin credenciales.
- `MAX_EVENTS`/`MAX_EVENTS_LIMIT` siguen vigentes.
- **PuntoTicket**: misma salida, mismos códigos de error, mismo `runStatus`, mismo exit code.

**Scope:**
Todo input que no cumpla `isBugCondition` queda sin cambios. Incluye corridas sanas, `succeeded` con eventos, y cualquier corrida de PuntoTicket (no activa `resilience`).

### Decisiones abiertas para TL/PO (propuestas como defaults configurables)

| # | Decisión | Default propuesto | Configuración |
|---|----------|-------------------|---------------|
| D1 | Umbral de degradación de detalles (1.4/2.4) | `partial` si ratio de fallas ≥ 0.25; `failed` si ≥ 0.75 | `TM_DEGRADED_RATIO`, `TM_FAILED_RATIO` |
| D2 | Mínimo de referencias del listado | `listing_empty` si 0; `listing_degraded` (partial) si < 10 | `TM_MIN_LISTING_REFS` |
| D3 | ¿`partial` falla el workflow? (1.6/2.6) | `failed` → exit 1; `partial` → exit 0 pero con anotación `::warning::` en Actions | `TM_FAIL_ON_PARTIAL` (`false` por defecto) |
| D4 | Cambiar User-Agent/headers | **No** se cambia (no se eluden bloqueos) | n/a |
| D5 | Reintentar 403 | No reintentar 401/403; sí 408/429/5xx | fijo |

Estos valores no están aprobados: quedan marcados como **OPEN** hasta que TL/PO decida. Se recomienda además revisar últimos runs de Actions y `scrape_run_errors` para confirmar el modo de falla dominante antes de fijar D1–D3.

## Hypothesized Root Cause

1. **Clasificación HTTP insuficiente**: `getHtml` lanza `http_error` para todo no-2xx y no distingue 401/403 ni desafío (`/queue`, `/login`) ni `Content-Type` ausente.
2. **Sin validación semántica del listado**: `scrape` acepta `references.length === 0`, y `runStatus(0,0,0)` devuelve `succeeded`. Probable causa del "verde silencioso" ante cambio de selector.
3. **Sin umbral de salud**: `runStatus` solo evalúa `failed > 0`; no hay ratio ni agrupación por causa.
4. **Backoff determinista**: `backoffMs = attempt*1000` sin jitter; 2 reintentos pueden sincronizarse con congestión transitoria.
5. **Salida del proceso**: el CLI solo marca exit 1 si `status === "failed"`; `partial` queda en 0.
6. **Diagnóstico**: `globalFailure` aplana `HttpAcquisitionError` a `Error("code: msg")` y se pierde `attempts`/status; el workflow registra `attempts: 1` fijo y `code: global_acquisition_failure`.
7. Hipótesis no confirmada: la causa real en producción (bloqueo anti-bot vs. cambio de HTML vs. red) no se puede determinar sin logs; el diseño instrumenta para distinguirlas.

## Correctness Properties

Property 1: Bug Condition - Fallas de scrape clasificadas y visibles

_For any_ corrida donde la bug condition se cumple (isBugCondition retorna true) y `resilience` está activa, el scraper corregido SHALL (a) emitir un código de error específico (`blocked`, `blocked_redirect`/`challenge`, `listing_empty`, `listing_degraded`, `degraded_details`), (b) registrar `stage`, `http_status` (si aplica) y `attempts`, (c) NO marcar la corrida `succeeded` cuando el listado tenga 0 referencias, (d) aplicar la política de salida D3, (e) usar backoff con jitter acotado respetando `Retry-After`/`maxRetryAfterMs`, y (f) conservar `source_url` del evento afectado sin credenciales.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

Property 2: Preservation - Corridas sanas y PuntoTicket sin cambios

_For any_ corrida donde la bug condition NO se cumple, o que ejecute PuntoTicket (sin `resilience`), el código corregido SHALL producir el mismo `ScrapeResult`, los mismos códigos de error, el mismo `status` persistido y el mismo exit code que el original, preservando idempotencia por `source_id`, límites de política, fechas/zona horaria, procesamiento independiente por evento y `MAX_EVENTS`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `scrapers/core/src/acquisition/policy.ts`

**Specific Changes**:
1. Agregar `ResilienceConfig` opcional a `AcquisitionConfig`/`acquisitionConfig`: `{ classifyBlocking, jitterRatio, minListingRefs, degradedRatio, failedRatio }`. Default `undefined` = comportamiento actual. Validar rangos (0–1, enteros ≥ 0). Sin cambiar los límites duros existentes.

**File**: `scrapers/core/src/acquisition/http.ts`

**Function**: `HttpClient.getHtml`, `HttpAcquisitionError`

**Specific Changes**:
2. Ampliar `HttpErrorCode` con `blocked` (401/403), `blocked_redirect` (redirección a ruta bloqueada, solo si `classifyBlocking`), `challenge` (HTML de desafío/cola detectado por marcadores estáticos en `Content-Type` ausente/no HTML o ruta `/queue`). Añadir `httpStatus?: number` a `HttpAcquisitionError`. Con `classifyBlocking` desactivado se mantiene `http_error`/`redirect_rejected`/`invalid_content_type`.
3. No reintentar 401/403. Mantener reintento para 408/429/5xx y timeout/red.
4. `backoffMs(attempt, jitterRatio, random)`: base lineal actual ± jitter (`random` inyectable para tests); con `jitterRatio` indefinido o 0 devuelve el valor actual. El delay respeta `Retry-After` ≤ `maxRetryAfterMs` y nunca baja del `delayMs` mínimo vía `RequestLimiter`.

**File**: `scrapers/core/src/acquisition/orchestrator.ts`

**Function**: `scrape`, `globalFailure`, `ScrapeResult`

**Specific Changes**:
5. `ScrapeError` gana `http_status?: number`. `globalFailure` conserva el `HttpAcquisitionError` (código, status, attempts) en un `ScrapeStageError` en vez de aplanarlo.
6. Si `resilience` activa y `references.length < minListingRefs`: emitir `listing_empty` (0) o `listing_degraded` (> 0 y bajo el mínimo); 0 refs lanza falla global.
7. Agregar `summary.failure_breakdown` (conteo por `code`) y `health: "ok" | "degraded" | "failed"` calculado con `degradedRatio`/`failedRatio`. Solo se calcula con `resilience`.

**File**: `scrapers/core/src/persistence/workflow.ts`

**Function**: `executePersistedScrape`, `runStatus`

**Specific Changes**:
8. Si `scraped.health` es `degraded`, forzar `status = "partial"` (aunque no haya `failed`); si es `failed`, `status = "failed"`. Sin `health` (PuntoTicket) se usa el `runStatus` actual.
9. En el catch global, registrar `stage`, `code` y `attempts` reales de la causa raíz en lugar de `global_acquisition_failure`/`attempts: 1` cuando haya información; si no, mantener el código genérico. Mensajes siguen pasando por `sanitizePersistenceMessage`.

**File**: `scrapers/ticketmaster/src/cli/ticketmaster-scrape.ts`, `scrapers/ticketmaster/src/acquisition/policy.ts`

**Specific Changes**:
10. Activar `resilience` con los defaults D1/D2 leyendo env (`TM_*`) con validación como `envInteger`.
11. Exit code: 1 si `failed`; 1 si `partial` y `TM_FAIL_ON_PARTIAL=true`; en `partial` con default imprimir `::warning::` a stdout para que Actions lo anote. Solo en el CLI de Ticketmaster; el de PuntoTicket no se toca.

**File**: `.github/workflows/scrape-ticketmaster.yml`

**Specific Changes**:
12. Exponer las variables `TM_*` vía `vars.*` con los defaults propuestos. Sin secretos nuevos.

**Docs**: actualizar `docs/` (contrato de códigos de error y política de salida) cuando se implemente.

## Testing Strategy

### Validation Approach

Dos fases: primero contraejemplos en código sin corregir; luego verificar el fix y la preservación (incluido PuntoTicket). Se usan transportes y `random`/`sleep` inyectables, sin red real.

### Exploratory Bug Condition Checking

**Goal**: Reproducir el bug antes de arreglarlo y confirmar o refutar las hipótesis.

**Test Plan**: Tests en `scrapers/ticketmaster/tests` con transporte falso contra `scrape` y `executePersistedScrape` con persistencia en memoria. Ejecutar en código SIN corregir.

**Test Cases**:
1. **Listado 403**: transporte devuelve 403; se espera `blocked` + `http_status` (fallará: `http_error` sin status).
2. **Redirección a `/queue`**: se espera `blocked_redirect` (fallará: `redirect_rejected`).
3. **Listado vacío**: HTML válido sin `div.grid_element`; se espera `failed`/`listing_empty` (fallará: `succeeded`).
4. **Ratio de fallas**: 50% de detalles sin JSON-LD; se espera `partial` con desglose (fallará: sin desglose).
5. **Backoff**: dos 503; se espera jitter dentro del rango (fallará: delays exactos 1000/2000).
6. **Exit code partial** (borde): se espera política D3 (puede fallar: siempre 0).

**Expected Counterexamples**:
- 403 → `http_error` sin status; 0 refs → `succeeded`; desglose ausente.
- Causas posibles: clasificación HTTP, ausencia de validación semántica, `runStatus` solo por conteos.

### Fix Checking

**Goal**: Para todo input con bug condition, la función corregida produce el comportamiento esperado.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := scrapeTicketmaster'(X)
  ASSERT result.errorCode IN {blocked, blocked_redirect, challenge, listing_empty, listing_degraded, degraded_details}
     AND hasDiagnostics(result, {stage, httpStatus, attempts})
     AND (X.listing.references = 0 IMPLIES result.status != "succeeded")
     AND result.respectsSourceLimits
     AND NOT containsCredentials(result)
END FOR
```

### Preservation Checking

**Goal**: Para todo input sin bug condition, el resultado es idéntico al original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT scrapeTicketmaster(X) = scrapeTicketmaster'(X)
END FOR
```

**Testing Approach**: Property-based testing (fast-check o equivalente ya usado en el repo; verificar antes) porque genera muchas combinaciones de status/headers/HTML y detecta bordes que los unit tests omiten.

**Test Plan**: Observar el comportamiento en código sin corregir con fixtures existentes (`ticketmaster-listing.html`, `ticketmaster-detail-*.html`) y con corridas de PuntoTicket; luego fijar esa salida como oráculo.

**Test Cases**:
1. **Corrida sana Ticketmaster**: mismos eventos, `source_url`, `time_known` y `status = succeeded`.
2. **Idempotencia**: reejecutar no duplica por `source_id`.
3. **PuntoTicket idéntico**: mismos códigos (`http_error` para 403, `succeeded` con 0 refs, backoff 1000/2000, `partial` exit 0).
4. **Límites de política**: concurrencia, delay, timeout, redirecciones, 2 MiB, `MAX_EVENTS`.

### Unit Tests

- `getHtml`: 401/403 → `blocked` sin reintento; 429/503 con `Retry-After` y jitter acotado; `Content-Type` ausente → `challenge`/`invalid_content_type` según flag.
- `scrape`: 0 refs, refs bajo mínimo, desglose por código, `health` en bordes de umbral (0.25, 0.75).
- `runStatus`/workflow: forzado a `partial`/`failed` por `health`; diagnóstico de falla global con status y attempts.
- CLI: exit code según `TM_FAIL_ON_PARTIAL`; variables `TM_*` inválidas rechazadas.
- Mensajes sin credenciales en URLs.

### Property-Based Tests

- Generar secuencias de respuestas (status, headers, redirecciones) y verificar que sin `resilience` el resultado coincide con el original.
- Generar ratios de falla y verificar monotonía: más fallas nunca mejora `health`.
- Generar `random` y `Retry-After`: el delay siempre ≤ `maxRetryAfterMs` y ≥ `delayMs` mínimo.
- Generar listados con N refs y verificar que `succeeded` nunca ocurre con N = 0.

### Integration Tests

- Flujo `executePersistedTicketmasterScrape` con persistencia en memoria: listado 403 → run `failed` con error `blocked` en `scrape_run_errors`.
- Corrida mixta (algunos detalles OK, otros bloqueados): eventos válidos persistidos, run `partial`, anotación/exit según D3.
- Corrida PuntoTicket completa con fixtures: salida sin cambios respecto de la línea base.
