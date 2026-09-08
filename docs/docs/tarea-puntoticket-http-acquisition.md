Tarea — Adquisición HTTP controlada de PuntoTicket

Estado: propuesta para aprobación TL/PO
Etapa: Etapa 0 — Primera fuente
Branch: feat/puntoticket-http-acquisition
Dependencia: parser fixture-first de PuntoTicket aprobado por QA
Fecha: 8 de septiembre de 2026

1. Resumen

La base fixture-first de PuntoTicket ya permite:

Descubrir publicaciones desde HTML de listing.

Extraer y normalizar detalles de eventos.

Representar múltiples funciones.

Consolidar modalidades comerciales.

Separar source_url de purchase_url.

Ejecutar listing y detail mediante CLI.

Probar la lógica sin acceder a la fuente.

Esta tarea agregará la capa de adquisición HTTP necesaria para ejecutar el flujo completo desde una URL real de PuntoTicket:

Descargar el listing.

Descubrir publicaciones.

Descargar los detalles.

Procesarlos mediante los parsers existentes.

Generar un resultado consolidado local.

Todavía no se persistirán resultados ni se programarán ejecuciones automáticas.

2. Objetivo

Implementar un scraper manual y controlado que obtenga HTML público de PuntoTicket mediante HTTP y reutilice los parsers existentes.

El resultado debe permitir comprobar localmente el flujo:

PuntoTicket → adquisición HTTP → parser → normalización → JSON

La adquisición debe aplicar límites explícitos para evitar solicitudes excesivas, redirecciones inseguras, descargas descontroladas o accesos accidentales a dominios no permitidos.

3. Alcance incluido

Cliente HTTP reutilizable e inyectable.

Descarga del listing de música.

Descubrimiento de publicaciones mediante el parser actual.

Descarga de detalles.

Normalización mediante la implementación actual.

Concurrencia limitada.

Pausa configurable entre solicitudes.

Timeout por solicitud.

Reintentos acotados.

Manejo de Retry-After.

Validación de URLs antes de cada solicitud.

Validación manual de redirecciones.

Límite de tamaño por respuesta.

Validación básica de tipo de contenido.

Continuación ante errores individuales.

Resultado JSON consolidado.

Resumen de ejecución y errores.

CLI de ejecución manual.

Pruebas deterministas sin acceder a internet.

Documentación operativa.

4. Fuera de alcance

Persistencia en Supabase.

Migraciones o tablas.

API pública.

Frontend.

Playwright o navegador automatizado.

GitHub Actions.

Cron o programación automática.

Despliegue.

SQS, EventBridge, Lambda o ECS.

Recorrido del proceso de compra.

Acceso autenticado.

Uso de cuentas personales.

Resolución automática de CAPTCHA.

Evasión de bloqueos o controles de la fuente.

Descarga o almacenamiento de imágenes.

Incorporación de otras ticketeras.

5. Restricciones de la fuente

La ejecución se limitará a información pública del catálogo.

No se deben solicitar deliberadamente rutas relacionadas con:

Pago.

Confirmación.

Login.

Registro.

Selección de entradas.

Dirección o envío.

Cuenta del cliente.

Compra.

Cola de compra.

Los enlaces purchase_url se extraen para redireccionar posteriormente al usuario, pero el scraper no debe seguirlos.

La tarea continuará bajo el supuesto documentado de que se cuenta o se contará con la autorización necesaria. Esto no reemplaza una autorización legal o contractual real.

6. Diseño esperado

Mantener separadas las siguientes responsabilidades.

6.1. Cliente HTTP

Responsable de:

Ejecutar solicitudes.

Aplicar timeout.

Aplicar reintentos.

Controlar redirecciones.

Limitar el tamaño de respuesta.

Validar el tipo de contenido.

Entregar HTML o un error tipado.

No debe conocer reglas de extracción de PuntoTicket.

6.2. Política de adquisición

Responsable de:

Validar protocolos y dominios.

Rechazar credenciales en URLs.

Determinar rutas permitidas y bloqueadas.

Definir límites de concurrencia.

Definir pausas.

Definir timeout y reintentos.

Evitar el seguimiento de URLs de compra.

6.3. Orquestador PuntoTicket

Responsable de:

Solicitar el listing.

Ejecutar el parser de listing existente.

Limitar las publicaciones que se procesarán.

Solicitar cada detalle.

Ejecutar la extracción y normalización existentes.

Acumular resultados y errores.

Generar el resumen final.

6.4. CLI

Responsable de:

Recibir configuración explícita.

Iniciar una ejecución manual.

Escribir un único JSON válido en stdout cuando corresponda.

Escribir diagnósticos en stderr.

Entregar un exit code coherente.

7. Política inicial propuesta

Los valores deben quedar centralizados y configurables dentro de rangos seguros.

Parámetro

Valor predeterminado

Límite inicial

Concurrencia

1

Máximo 2

Pausa entre solicitudes

1.500 ms

Mínimo 1.000 ms

Timeout por solicitud

15 segundos

Máximo 30 segundos

Reintentos adicionales

2

Máximo 2

Redirecciones

3

Máximo 3

Tamaño máximo de HTML

2 MB

Máximo 2 MB

Eventos por ejecución manual

10

Máximo 50

Listing permitido

/musica

Solo rutas aprobadas

Protocolo

HTTPS

Sin excepción

Dominio de catálogo

www.puntoticket.com

Lista exacta

Ejecución automática

Deshabilitada

Fuera de alcance

Navegador automatizado

No utilizado

Fuera de alcance

El análisis técnico puede proponer cambios, pero deben justificarse y ser aprobados por TL/PO antes de implementar.

8. Seguridad HTTP

Antes de realizar cada solicitud se debe validar:

Protocolo HTTPS.

Host permitido mediante comparación exacta.

Ausencia de username.

Ausencia de password.

Puerto permitido.

Ruta de catálogo permitida.

Ausencia de rutas de compra, cola o cuenta.

Cantidad máxima de redirecciones.

No usar validaciones por coincidencia parcial del hostname.

El siguiente hostname debe rechazarse:

www.puntoticket.com.attacker.example

Las redirecciones deben procesarse manualmente. Cada Location debe resolverse y validarse antes de realizar la siguiente solicitud.

No enviar:

Cookies.

Authorization.

Credenciales.

Datos personales.

Headers copiados desde una sesión real.

Información obtenida desde Playwright.

Usar un User-Agent transparente y configurable que identifique el proyecto, sin suplantar navegadores o crawlers conocidos.

Propuesta inicial:

miShow-catalog/0.1 (+contacto-del-proyecto)

El contacto definitivo debe aprobarse antes de ejecutar contra la fuente real.

9. Redirecciones

El cliente HTTP no debe seguir redirecciones automáticamente.

Para cada respuesta de redirección debe:

Leer Location.

Resolver URLs relativas contra la URL actual.

Aplicar nuevamente toda la política de seguridad.

Verificar el máximo de redirecciones.

Continuar solamente si la URL es válida.

Una redirección hacia queue/enqueue, otro host, un protocolo no permitido o una URL con userinfo debe rechazarse.

10. Reintentos

Se pueden reintentar errores transitorios:

Timeout.

Fallos temporales de red.

HTTP 408.

HTTP 429.

HTTP 500, 502, 503 y 504.

No reintentar automáticamente:

Otros errores HTTP 4xx.

URLs rechazadas por la política.

Contenido demasiado grande.

Tipo de contenido no permitido.

Errores deterministas del parser.

Si existe Retry-After, respetarlo dentro de un máximo configurable.

Aplicar espera incremental entre reintentos. Las pruebas deben poder sustituir el reloj o la espera para continuar siendo rápidas y deterministas.

11. Límites de contenido

Aceptar únicamente respuestas compatibles con HTML, por ejemplo:

text/html
application/xhtml+xml

La ausencia de Content-Type debe tratarse de forma explícita y documentada, sin permitir descargas sin límite.

Interrumpir la lectura cuando la respuesta supere el máximo configurado.

No guardar automáticamente el HTML descargado.

Si en el futuro se agrega una opción de diagnóstico para guardar HTML fallido:

Debe ser explícita.

Debe escribir solamente dentro de .local/.

Debe estar deshabilitada por defecto.

No debe versionar esos archivos.

Debe evitar incluir secretos o credenciales.

Guardar HTML fallido queda fuera del alcance de esta tarea.

12. Ejecución explícita

La ejecución contra la fuente real debe requerir una señal explícita:

npm run puntoticket:scrape -- --live

Esto evita solicitudes accidentales durante pruebas o desarrollo.

La CLI debe permitir como mínimo:

--live
--listing-url
--max-events
--concurrency
--delay-ms
--timeout-ms

Los nombres definitivos pueden variar si se mantiene el mismo comportamiento observable.

No se deben aceptar valores que eliminen los límites de seguridad, como concurrencia ilimitada, timeout infinito, pausas inferiores al mínimo aprobado o una cantidad negativa de eventos.

13. Contrato de salida

Una ejecución exitosa debe escribir en stdout un único JSON válido:

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

Cada error debe identificar, cuando corresponda:

{
  "stage": "listing|detail|parse|normalize",
  "source_url": "https://www.puntoticket.com/...",
  "code": "timeout",
  "message": "Descripción segura del error",
  "attempts": 1
}

Los errores no deben contener:

Credenciales.

Cookies.

Authorization.

HTML completo.

Stack traces en el contrato público.

URLs con userinfo.

14. Semántica de éxito

14.1. Éxito completo

El listing fue procesado.

Todos los detalles intentados terminaron correctamente.

Exit code 0.

14.2. Éxito parcial

El listing fue procesado.

Uno o más detalles fallaron.

Los eventos exitosos se conservan.

El resultado incluye los errores.

Exit code 0.

summary.failed debe ser mayor que cero.

El éxito parcial usa exit code 0 porque la ejecución produjo un resultado válido y utilizable. Los consumidores deben revisar summary.failed.

14.3. Fallo global

No se pudo obtener o procesar el listing.

La configuración es inválida o insegura.

La ejecución no produjo un resultado utilizable.

La CLI entrega exit code distinto de cero.

El error se escribe en stderr.

stdout permanece vacío para evitar JSON parcial engañoso.

15. Idempotencia y determinismo

Con las mismas respuestas HTTP, configuración y tiempo inyectado:

El resultado normalizado debe ser equivalente.

El orden de eventos debe ser estable.

El orden de errores debe ser estable.

No debe depender del orden de finalización de solicitudes concurrentes.

La concurrencia no debe alterar el contrato final.

started_at, finished_at y extracted_at deben generarse o inyectarse mediante una abstracción de reloj comprobable.

16. Manejo de errores individuales

Un error al descargar o procesar un detalle no debe detener los demás eventos.

El orquestador debe:

Registrar el error.

Continuar con el siguiente detalle.

Mantener los eventos procesados correctamente.

Evitar reintentar errores deterministas.

Entregar conteos consistentes.

Debe cumplirse:

attempted = succeeded + failed

Además:

attempted <= discovered
attempted <= max-events

17. No seguimiento de enlaces de compra

El scraper puede extraer y conservar purchase_url, pero nunca debe realizar solicitudes hacia ese enlace.

Esto incluye:

/queue/enqueue/...

Rutas de compra.

URLs obtenidas desde JSON-LD.

URLs obtenidas desde botones o modalidades comerciales.

Las únicas solicitudes permitidas en esta etapa son:

El listing aprobado.

Las páginas públicas de detalle descubiertas en ese listing.

18. Pruebas mínimas

Las pruebas automatizadas no deben realizar solicitudes a PuntoTicket ni a internet.

Usar inyección del cliente HTTP, respuestas simuladas o un adaptador equivalente.

Cubrir:

Listing exitoso.

Descubrimiento y descarga de varios detalles.

Reutilización de los parsers existentes.

Resultado consolidado.

Orden estable con concurrencia.

Respeto de max-events.

Timeout.

Reintento de error transitorio.

Ausencia de reintento para error permanente.

HTTP 429 con Retry-After.

HTTP 500 seguido de éxito.

Límite máximo de reintentos.

Redirección válida.

Redirección hacia dominio no permitido.

Redirección hacia ruta bloqueada.

Exceso de redirecciones.

URL con username.

URL con password.

URL con username y password.

Hostname similar, pero no permitido.

Protocolo no permitido.

Puerto no permitido.

Tipo de contenido inválido.

Respuesta demasiado grande.

Fallo individual sin detener la ejecución.

Fallo global del listing.

Conteos consistentes.

JSON limpio en stdout.

Errores de CLI en stderr.

Argumentos inválidos.

Ausencia de --live.

Configuración fuera de rango.

No seguimiento de purchase_url.

Ausencia de solicitudes reales durante npm test.

Idempotencia con tiempo y respuestas inyectadas.

Regresión de los parsers fixture-first existentes.

19. Criterios de aceptación

La tarea estará aprobada cuando:

Exista una ejecución manual completa desde listing hasta JSON normalizado.

Los parsers actuales se reutilicen sin duplicar su lógica.

No se siga ningún purchase_url.

Toda URL solicitada pase por una política centralizada.

Las redirecciones se validen antes de seguirse.

La concurrencia y las pausas estén limitadas.

Los reintentos sean acotados.

El tamaño de respuesta esté limitado.

Un fallo individual no detenga el resto.

El resultado tenga conteos coherentes.

Las pruebas no accedan a internet.

TypeScript, lint y pruebas pasen.

La documentación explique operación y límites.

La validación manual mínima sea aprobada por TL/PO.

QA emita un veredicto explícito de aprobación.

20. Validación manual controlada

La ejecución real no debe realizarse automáticamente durante el desarrollo.

Después de aprobar las pruebas automatizadas y obtener autorización TL/PO, ejecutar primero:

npm run puntoticket:scrape -- \
  --live \
  --listing-url https://www.puntoticket.com/musica \
  --max-events 2 \
  --concurrency 1 \
  --delay-ms 1500 \
  --timeout-ms 15000

Validar:

Una solicitud al listing.

Máximo dos solicitudes de detalle.

Ninguna solicitud a queue/enqueue.

JSON válido.

Conteos consistentes.

Eventos normalizados.

Tiempo total razonable.

Ausencia de cookies y credenciales.

Identificación transparente mediante User-Agent.

El límite solo puede aumentarse después de revisar esta ejecución.

21. Verificaciones obligatorias

Dev debe ejecutar:

npm test
npm run typecheck
npm run lint
git diff --check

QA debe ejecutar las mismas verificaciones de forma independiente.

Si un comando no existe o no puede ejecutarse, debe informarse explícitamente. No se puede declarar aprobado un control que no fue ejecutado.

22. Decisiones TL/PO adoptadas para la propuesta

Éxito parcial: exit code 0 con summary.failed > 0.

Concurrencia predeterminada: 1.

Concurrencia máxima: 2.

Pausa predeterminada: 1.500 ms.

Pausa mínima permitida: 1.000 ms.

Máximo inicial: 10 eventos por ejecución manual.

Máximo configurable inicial: 50 eventos.

HTML fallido: no se guarda en esta etapa.

Host de adquisición: solamente www.puntoticket.com.

Listing inicial permitido: /musica.

Las rutas de compra se extraen, pero no se solicitan.

No habrá solicitudes reales sin --live.

El contacto definitivo del User-Agent debe aprobarse antes de la validación real.

23. Decisiones todavía pendientes

Antes de implementar o ejecutar contra la fuente real, confirmar:

Texto definitivo del User-Agent y dato de contacto.

Si los parámetros máximos propuestos son adecuados o deben ser aún más conservadores.

Si el resultado del scraper se imprimirá solamente en stdout o también podrá escribirse en un archivo indicado explícitamente.

Cualquier ampliación de hosts, rutas o frecuencia requiere una nueva aprobación TL/PO.

24. Handoff Dev → QA

Dev debe entregar:

Decisiones aplicadas.

Archivos modificados.

Contrato de configuración.

Contrato de salida.

Resultado exacto de las pruebas.

Resultado de typecheck y lint.

Evidencia de que las pruebas no hicieron solicitudes reales.

Resultado de la validación manual mínima, si fue autorizada.

Riesgos residuales.

QA debe revisar independientemente:

Seguridad de URLs y redirecciones.

Límites de carga.

Reintentos.

Concurrencia.

Determinismo.

Contratos CLI.

Ausencia de red real en tests.

No seguimiento de enlaces de compra.

Coherencia documental.

Regresión de los parsers existentes.

Si QA encuentra defectos, la tarea vuelve a Dev y después debe repetirse la revisión completa.

La tarea solamente se cierra con:

VEREDICTO QA: APROBADO

25. Restricciones para los agentes

designer y qa pueden preparar análisis y pruebas en paralelo, ambos inicialmente en modo lectura.

Solamente un agente dev debe modificar código de producto.

No ejecutar dos agentes de desarrollo sobre los mismos archivos.

No realizar solicitudes reales durante el análisis.

No instalar dependencias sin justificar su necesidad.

Preferir capacidades estándar de Node.js cuando sean suficientes.

No crear recursos de Supabase.

No desplegar infraestructura.

No hacer commit, push, merge ni crear pull request sin autorización explícita.

26. Próxima etapa

Después de aprobar esta tarea, el siguiente incremento será diseñar la persistencia idempotente en Supabase.

La adquisición HTTP y la persistencia deben mantenerse como capas separadas para poder probar, sustituir y operar cada una independientemente.