# Tarea — Adquisición HTTP controlada de PuntoTicket

| Campo | Valor |
|---|---|
| Estado | Propuesta para aprobación TL/PO |
| Etapa | Etapa 0 — Primera fuente |
| Branch | `feat/puntoticket-http-acquisition` |
| Dependencia | Parser fixture-first de PuntoTicket aprobado por QA |
| Fecha | 8 de septiembre de 2026 |

## 1. Resumen

La base fixture-first de PuntoTicket ya permite:

- Descubrir publicaciones desde HTML de listing.
- Extraer y normalizar detalles de eventos.
- Representar múltiples funciones.
- Consolidar modalidades comerciales.
- Separar `source_url` de `purchase_url`.
- Ejecutar listing y detail mediante CLI.
- Probar la lógica sin acceder a la fuente.

Esta tarea agrega la capa de adquisición HTTP necesaria para ejecutar el flujo completo desde una URL real de PuntoTicket:

```text
PuntoTicket -> adquisicion HTTP -> parser -> normalizacion -> JSON
```

Todavía no se persisten resultados ni se programan ejecuciones automáticas.

## 2. Objetivo

Implementar un scraper manual y controlado que obtenga HTML público de PuntoTicket mediante HTTP y reutilice los parsers existentes.

La adquisición debe aplicar límites explícitos para evitar solicitudes excesivas, redirecciones inseguras, descargas descontroladas o accesos accidentales a dominios no permitidos.

## 3. Alcance Incluido

- Cliente HTTP reutilizable e inyectable.
- Descarga del listing de música.
- Descubrimiento de publicaciones mediante el parser actual.
- Descarga de detalles.
- Normalización mediante la implementación actual.
- Concurrencia limitada.
- Pausa configurable entre solicitudes.
- Timeout por solicitud.
- Reintentos acotados.
- Manejo de `Retry-After`.
- Validación de URLs antes de cada solicitud.
- Validación manual de redirecciones.
- Límite de tamaño por respuesta.
- Validación básica de tipo de contenido.
- Continuación ante errores individuales.
- Resultado JSON consolidado.
- Resumen de ejecución y errores.
- CLI de ejecución manual.
- Pruebas deterministas sin acceder a internet.
- Documentación operativa.

## 4. Fuera de Alcance

- Persistencia en Supabase.
- Migraciones o tablas.
- API pública.
- Frontend.
- Playwright o navegador automatizado.
- GitHub Actions.
- Cron o programación automática.
- Despliegue.
- SQS, EventBridge, Lambda o ECS.
- Recorrido del proceso de compra.
- Acceso autenticado.
- Uso de cuentas personales.
- Resolución automática de CAPTCHA.
- Evasión de bloqueos o controles de la fuente.
- Descarga o almacenamiento de imágenes.
- Incorporación de otras ticketeras.

## 5. Restricciones de la Fuente

La ejecución se limita a información pública del catálogo.

No se deben solicitar deliberadamente rutas relacionadas con:

- Pago, confirmación, compra o selección de entradas.
- Login, registro, autenticación o cuenta del cliente.
- Dirección, envío o datos personales.
- Cola de compra.

Los enlaces `purchase_url` se extraen para redireccionar posteriormente al usuario, pero el scraper no debe seguirlos.

La tarea continúa bajo el supuesto documentado de que se cuenta o se contará con la autorización necesaria. Esto no reemplaza una autorización legal o contractual real.

## 6. Diseño Esperado

Mantener separadas estas responsabilidades:

| Componente | Responsabilidad |
|---|---|
| Cliente HTTP | Ejecuta solicitudes, timeout, reintentos, redirecciones manuales, límite de tamaño y validación de tipo de contenido. No conoce reglas de extracción. |
| Política de adquisición | Valida protocolo, host, credenciales, puerto, rutas permitidas y bloqueadas, límites y prohibición de `purchase_url`. |
| Orquestador PuntoTicket | Solicita listing, ejecuta `parseMusicListing`, limita detalles, solicita cada detalle, extrae, normaliza y acumula resultados. |
| CLI | Recibe configuración explícita, inicia una ejecución manual, escribe JSON válido en stdout, diagnósticos en stderr y exit code coherente. |

## 7. Política Inicial

Los valores deben quedar centralizados y configurables dentro de rangos seguros.

| Parámetro | Valor predeterminado | Límite inicial |
|---|---:|---:|
| Concurrencia | 1 | Máximo 2 |
| Pausa entre solicitudes | 1.500 ms | Mínimo 1.000 ms |
| Timeout por solicitud | 15 segundos | Máximo 30 segundos |
| Reintentos adicionales | 2 | Máximo 2 |
| Redirecciones | 3 | Máximo 3 |
| Tamaño máximo de HTML | 2 MiB | Máximo 2 MiB |
| Eventos por ejecución manual | 10 | Máximo 50 |

| Regla | Valor |
|---|---|
| Listing permitido | `/musica` o `/musica/` |
| Detalles permitidos | `/evento/<identificador>` y landings públicas raíz de un segmento solo si fueron descubiertas por `parseMusicListing` |
| Protocolo | HTTPS sin excepción |
| Dominio de catálogo | `www.puntoticket.com` por comparación exacta |
| Ejecución automática | Deshabilitada |
| Navegador automatizado | No utilizado |

## 8. Seguridad HTTP

Antes de realizar cada solicitud se debe validar:

- Protocolo HTTPS.
- Host permitido mediante comparación exacta.
- Ausencia de `username` y `password`.
- Puerto estándar o `443`.
- Ruta de catálogo permitida.
- Ausencia de rutas de compra, cola, autenticación o cuenta.
- Cantidad máxima de redirecciones.
- Sin validaciones por coincidencia parcial del hostname.

El siguiente hostname debe rechazarse:

```text
www.puntoticket.com.attacker.example
```

Las redirecciones deben procesarse manualmente. Cada `Location` debe resolverse y validarse antes de realizar la siguiente solicitud.

No enviar:

- Cookies.
- `Authorization`.
- Credenciales.
- Datos personales.
- Headers copiados desde una sesión real.
- Información obtenida desde Playwright.

Usar un `User-Agent` transparente y configurable que identifique el proyecto, sin suplantar navegadores o crawlers conocidos:

```text
miShow-puntoticket-acquisition/0.1
```

## 9. Redirecciones

El cliente HTTP no debe seguir redirecciones automáticamente.

Para cada respuesta de redirección debe:

1. Leer `Location`.
2. Resolver URLs relativas contra la URL actual.
3. Aplicar nuevamente toda la política de seguridad.
4. Verificar el máximo de redirecciones.
5. Continuar solamente si la URL es válida.

Una redirección hacia `queue/enqueue`, otro host, un protocolo no permitido, una URL con userinfo o una landing raíz no descubierta debe rechazarse.

## 10. Reintentos

Se pueden reintentar errores transitorios:

- Timeout.
- Fallos temporales de red.
- HTTP 408.
- HTTP 429.
- HTTP 500, 502, 503 y 504.

No reintentar automáticamente:

- Otros errores HTTP 4xx.
- URLs rechazadas por la política.
- Contenido demasiado grande.
- Tipo de contenido no permitido.
- Errores deterministas del parser.

Si existe `Retry-After`, respetarlo dentro de un máximo configurable. Las pruebas deben poder sustituir el reloj o la espera para continuar siendo rápidas y deterministas.

## 11. Límites de Contenido

Aceptar únicamente respuestas compatibles con HTML:

```text
text/html
application/xhtml+xml
```

La ausencia de `Content-Type` debe tratarse de forma explícita y documentada, sin permitir descargas sin límite.

Interrumpir la lectura cuando la respuesta supere el máximo configurado. No guardar automáticamente el HTML descargado.

Guardar HTML fallido queda fuera del alcance de esta tarea. Si en el futuro se agrega una opción de diagnóstico, debe ser explícita, escribir solo dentro de `.local/`, estar deshabilitada por defecto y evitar secretos o credenciales.

## 12. Ejecución Explícita

La ejecución contra la fuente real debe requerir una señal explícita:

```bash
npm run puntoticket:scrape -- --live
```

La CLI debe permitir como mínimo:

- `--live`
- `--listing-url`
- `--max-events`
- `--concurrency`
- `--delay-ms`
- `--timeout-ms`

No se deben aceptar valores que eliminen los límites de seguridad, como concurrencia ilimitada, timeout infinito, pausas inferiores al mínimo aprobado o una cantidad negativa de eventos.

## 13. Contrato de Salida

Una ejecución exitosa debe escribir en stdout un único JSON válido:

```json
{
  "source": "puntoticket",
  "started_at": "2026-09-08T12:00:00.000Z",
  "finished_at": "2026-09-08T12:00:10.000Z",
  "listing_url": "https://www.puntoticket.com/musica",
  "summary": {
    "discovered": 0,
    "attempted": 0,
    "succeeded": 0,
    "failed": 0
  },
  "events": [],
  "errors": []
}
```

Cada error debe identificar, cuando corresponda:

```json
{
  "stage": "listing|detail|parse|normalize",
  "source_url": "https://www.puntoticket.com/...",
  "code": "timeout",
  "message": "Descripcion segura del error",
  "attempts": 1
}
```

Los errores no deben contener credenciales, cookies, `Authorization`, HTML completo, stack traces ni URLs con userinfo.

## 14. Semántica de Éxito

### 14.1. Éxito Completo

- El listing fue procesado.
- Todos los detalles intentados terminaron correctamente.
- Exit code 0.

### 14.2. Éxito Parcial

- El listing fue procesado.
- Uno o más detalles fallaron.
- Los eventos exitosos se conservan.
- El resultado incluye errores.
- Exit code 0.
- `summary.failed` es mayor que cero.

El éxito parcial usa exit code 0 porque la ejecución produjo un resultado válido y utilizable. Los consumidores deben revisar `summary.failed`.

### 14.3. Fallo Global

- No se pudo obtener o procesar el listing.
- La configuración es inválida o insegura.
- La ejecución no produjo un resultado utilizable.
- La CLI entrega exit code distinto de cero.
- El error se escribe en stderr.
- stdout permanece vacío para evitar JSON parcial engañoso.

## 15. Idempotencia y Determinismo

Con las mismas respuestas HTTP, configuración y tiempo inyectado:

- El resultado normalizado debe ser equivalente.
- El orden de eventos debe ser estable.
- El orden de errores debe ser estable.
- No debe depender del orden de finalización de solicitudes concurrentes.
- La concurrencia no debe alterar el contrato final.
- `started_at`, `finished_at` y `extracted_at` deben generarse o inyectarse mediante una abstracción de reloj comprobable.

## 16. Manejo de Errores Individuales

Un error al descargar o procesar un detalle no debe detener los demás eventos.

El orquestador debe:

- Registrar el error.
- Continuar con el siguiente detalle.
- Mantener los eventos procesados correctamente.
- Evitar reintentar errores deterministas.
- Entregar conteos consistentes.

Debe cumplirse:

```text
attempted = succeeded + failed
attempted <= discovered
attempted <= max-events
```

## 17. No Seguimiento de Enlaces de Compra

El scraper puede extraer y conservar `purchase_url`, pero nunca debe realizar solicitudes hacia ese enlace.

Esto incluye:

- `/queue/enqueue/...`
- Rutas de compra.
- URLs obtenidas desde JSON-LD.
- URLs obtenidas desde botones o modalidades comerciales.

Las únicas solicitudes permitidas en esta etapa son el listing aprobado y las páginas públicas de detalle descubiertas en ese listing.

## 18. Pruebas Mínimas

Las pruebas automatizadas no deben realizar solicitudes a PuntoTicket ni a internet. Usar inyección del cliente HTTP, respuestas simuladas o un adaptador equivalente.

Cubrir:

- Listing exitoso.
- Descubrimiento y descarga de varios detalles.
- Reutilización de los parsers existentes.
- Resultado consolidado.
- Orden estable con concurrencia.
- Continuación ante errores individuales.
- Validación de redirecciones.
- Rechazo de URLs inseguras o fuera de alcance.
- Rechazo de rutas bloqueadas, incluyendo compra, cuenta, autenticación y cola.
- No seguimiento de `purchase_url`.
- CLI sin `--live`.

## 19. Criterios de Aceptación

- La adquisición HTTP está deshabilitada salvo ejecución manual con `--live`.
- El listing permitido se limita a `https://www.puntoticket.com/musica`.
- Los detalles se limitan a `/evento/<identificador>` o landings públicas raíz de un segmento descubiertas por `parseMusicListing`.
- Una landing raíz solicitada directamente, sin evidencia de descubrimiento, se rechaza.
- Cada URL se valida antes de solicitarse y antes de seguir una redirección.
- No se siguen redirects inseguros ni se amplían hosts o protocolos.
- No se solicita ningún `purchase_url`.
- Los límites de concurrencia, pausa, timeout, reintentos, redirecciones, tamaño y cantidad de eventos quedan centralizados.
- Los resultados mantienen orden estable e idempotencia con fixtures equivalentes.
- Los errores individuales de detalle no detienen la ejecución completa.
- Las pruebas son fixture-first y no acceden a internet, Playwright, Supabase ni infraestructura.

## 20. Comandos de Verificación

```bash
npm test
npm run typecheck
npm run lint
git diff --check
git status --short
```

## 21. Notas Operativas

- No desplegar como parte de esta tarea.
- No crear recursos externos.
- No usar credenciales productivas.
- No habilitar cobros.
- No cerrar la historia sin validación QA independiente.
