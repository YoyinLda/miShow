# Bugfix Requirements Document

## Introduction

Los scrapeos programados de Ticketmaster Chile (`.github/workflows/scrape-ticketmaster.yml`, 2 corridas/día) han fallado últimamente de forma intermitente. Del análisis del código (`scrapers/ticketmaster`, `scrapers/core`) no hay logs de corridas en el repo, por lo que la causa raíz exacta en producción no está confirmada. Sí se identificaron modos de falla que el scraper hoy no distingue, no reintenta correctamente o no reporta (bloqueos anti-bot, cambios de selectores, redirecciones, timeouts, y corridas degradadas que terminan en verde). El impacto es catálogo desactualizado y fallas silenciosas o difíciles de diagnosticar.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN Ticketmaster responde 403 (u otro 4xx de bloqueo/WAF) al listado o a un detalle THEN the system lo trata como `http_error` genérico sin reintento ni clasificación de bloqueo, y la corrida pierde esos eventos (o falla completa si es el listado) sin indicar que fue un bloqueo.

1.2 WHEN Ticketmaster responde con una página de desafío, cola de espera o redirección a una ruta bloqueada (`/queue`, `/login`, etc.) o con `Content-Type` ausente/no HTML THEN the system reporta `redirect_rejected` o `invalid_content_type` indistinguibles de otros errores, sin señal de que la fuente está bloqueando al scraper.

1.3 WHEN el selector del listado (`div.grid_element a[href*='/event/']`) deja de coincidir por un cambio de HTML THEN the system devuelve 0 referencias sin error, y la corrida persistida queda con estado `succeeded` (0 descubiertos, 0 fallidos).

1.4 WHEN el JSON-LD del detalle cambia o falta, o la fecha no se puede derivar THEN the system registra errores `parse_error`/`normalize_error` por evento sin un umbral que marque la corrida como degradada si la mayoría de los detalles falla.

1.5 WHEN un request da timeout (15 s) o error de red THEN the system reintenta como máximo 2 veces con backoff lineal fijo (1 s, 2 s) sin jitter, y falla el evento (o la corrida completa si es el listado) ante una congestión transitoria de la fuente.

1.6 WHEN una corrida termina con eventos fallidos pero al menos uno persistido (estado `partial`) THEN the system sale con código 0 y el workflow queda en verde, ocultando degradaciones.

1.7 WHEN la corrida falla por completo THEN the system registra un único error genérico `global_acquisition_failure` con mensaje truncado a la primera línea, sin el código HTTP ni la etapa que permita diagnosticar la causa.

### Expected Behavior (Correct)

2.1 WHEN Ticketmaster responde 403/401 u otro código de bloqueo THEN the system SHALL clasificarlo con un código explícito (p. ej. `blocked`), registrar el estado HTTP, no insistir más allá de los reintentos acotados, y respetar `Retry-After`/límites de la fuente sin eludir el bloqueo.

2.2 WHEN la respuesta es un desafío, cola de espera, redirección a ruta bloqueada o contenido no HTML THEN the system SHALL reportar un código de error específico que identifique el bloqueo y conservar la URL original (`source_url`) del evento afectado.

2.3 WHEN el listado devuelve HTML válido pero 0 referencias (o muy por debajo de lo esperado) THEN the system SHALL tratar la corrida como fallida o degradada con un código explícito (p. ej. `listing_empty`/`selector_mismatch`) y SHALL NOT marcarla como `succeeded`.

2.4 WHEN la proporción de detalles con error de parseo/normalización supera un umbral definido THEN the system SHALL marcar la corrida como `partial` o `failed` con el código y conteo de causas agrupadas por tipo de error.

2.5 WHEN ocurre timeout, error de red o estado reintentable (408/429/5xx) THEN the system SHALL reintentar con backoff acotado y jitter, respetando `maxRetryAfterMs`, delay mínimo y concurrencia máxima actuales, y SHALL agotar los reintentos antes de fallar.

2.6 WHEN una corrida termina `partial` o `failed` THEN the system SHALL señalizarlo de forma visible (código de salida/anotación del workflow según el umbral que decida TL/PO) para que el fallo no quede oculto.

2.7 WHEN la corrida falla THEN the system SHALL registrar etapa, código de error, estado HTTP y número de intentos de la causa raíz, sin incluir secretos ni credenciales en URLs.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN el listado y los detalles responden correctamente (2xx HTML con JSON-LD válido) THEN the system SHALL CONTINUE TO extraer, normalizar y persistir los eventos con `source: ticketmaster` y su `source_url` original.

3.2 WHEN se reejecuta la ingesta sobre los mismos eventos o tras un reintento THEN the system SHALL CONTINUE TO persistir de forma idempotente por `source_id`, sin duplicados.

3.3 WHEN se hacen requests THEN the system SHALL CONTINUE TO respetar HTTPS, host `www.ticketmaster.cl`, rutas bloqueadas (compra, cuenta, API, cola), concurrencia ≤ 2, delay ≥ 1000 ms (default 1500 ms), timeout ≤ 30 s, máximo 3 redirecciones y límite de 2 MiB por HTML.

3.4 WHEN el detalle no trae hora THEN the system SHALL CONTINUE TO emitir fecha date-only con `time_known: false` e interpretarla en zona `America/Santiago`; con hora real SHALL CONTINUE TO conservar el offset explícito.

3.5 WHEN un evento individual falla THEN the system SHALL CONTINUE TO procesar los demás eventos de la corrida y persistir los exitosos.

3.6 WHEN falla un evento THEN the system SHALL CONTINUE TO registrar el error por evento en `scrape_run_errors` sin exponer credenciales, y las corridas de PuntoTicket SHALL CONTINUE TO comportarse igual (el core es compartido).

3.7 WHEN el listado excede `MAX_EVENTS` THEN the system SHALL CONTINUE TO respetar los límites configurables `MAX_EVENTS`/`MAX_EVENTS_LIMIT`.

## Bug Condition (derivado)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ScrapeRun (respuestas de la fuente + resultado)
  OUTPUT: boolean

  RETURN (X.listing.status IN {401, 403}
          OR X.response.isChallengeOrQueueOrBlockedRedirect
          OR (X.listing.ok AND X.listing.references = 0)
          OR X.detail.parseFailureRatio > UMBRAL
          OR X.transientFailure AND X.retriesExhaustedWithoutJitter
          OR (X.status = "partial" AND X.exitCode = 0))
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  result ← scrapeTicketmaster'(X)
  ASSERT result.errorCode IS specific (blocked | listing_empty | degraded | ...)
     AND result.status != "succeeded" WHEN listing.references = 0
     AND result.diagnostics INCLUDE (stage, httpStatus, attempts)
     AND result.respectsSourceLimits
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT scrapeTicketmaster(X) = scrapeTicketmaster'(X)
END FOR
```

## Notas para TL/PO

- Sin logs de ejecución en el repo: antes del diseño conviene revisar los últimos runs de GitHub Actions y `scrape_run_errors` en Supabase para confirmar cuál modo de falla domina.
- Decisiones pendientes: umbral de degradación (1.4/2.4), si `partial` debe fallar el workflow (1.6/2.6), y si aplica cambiar el User-Agent o headers (no se propone eludir bloqueos).
