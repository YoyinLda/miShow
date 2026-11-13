# Documento de Requisitos

## Introducción

Hoy el scraper de PuntoTicket (`scrapers/puntoticket`) descubre eventos únicamente desde el listado `https://www.puntoticket.com/musica`. Se detectó un evento existente que no aparece en `/musica` pero sí al buscar por venue en el sitio, y las páginas de venues muestran eventos distintos a `/musica`.

Esta feature agrega una segunda vía de descubrimiento (páginas de venues), la diferencia de la vía existente para identificar los eventos faltantes, y mantiene las reglas del proyecto: ingesta idempotente por `source` + `source_url`, límites de cortesía hacia la fuente, conservación de fuente y URL original, zonas horarias explícitas y tolerancia a reintentos. No cambia el comportamiento actual de `/musica`. Reutiliza `scrapers/core` (`SourceAdapter`, `HttpClient`, `validateAcquisitionUrl`, `normalizeEvent`, workflow de persistencia) y el contrato `NormalizedEvent` de `@mishow/domain`.

### Hallazgos del código actual (base del análisis)

- `puntoticketAdapter` (`scrapers/puntoticket/src/adapter.ts`) expone un único `listingUrl` (`/musica`) y `isListingPath` solo acepta `/musica` y `/musica/`.
- `scrape()` (`scrapers/core/src/acquisition/orchestrator.ts`) recibe una sola URL de listado, la parsea con `adapter.parseListing`, valida cada referencia como `detail`, recorta a `maxEvents` y procesa detalles con `concurrency` ≤ 2.
- `parseMusicListing` descarta explícitamente rutas `/recintos/...` (`NON_EVENT_PATH`), y `isBlockedPath` bloquea `/musica`, `/deportes`, `/teatro`, etc. fuera de la etapa `listing`.
- Los límites de cortesía viven en `acquisitionDefaults` (concurrencia ≤ 2, `delayMs` mínimo 1000, reintentos ≤ 2, redirecciones ≤ 3, HTML ≤ 2 MiB, `maxEvents` ≤ `maxEventsLimit`).
- `robots.txt` de PuntoTicket (consultado una vez) no prohíbe rutas de venues; prohíbe `/Pago*`, `/Comprar*`, `/Login*`, `/Categoria*`, `/Seleccion*`, entre otras.
- Una prueba rápida de `https://www.puntoticket.com/recintos` devolvió 404, por lo que `/recintos` no es la ruta de venues. TL/PO definió que las páginas de venue viven en `https://www.puntoticket.com/<source_slug>` (p. ej. `/santander-arena`), registradas en `venue_sources` (ver Decisiones de TL/PO).
- La identidad persistida de un evento es `source` + `source_url` canónica (`canonicalSourceUrl`), validada en `mapping.ts`.

## Glosario

- **Scraper_PuntoTicket**: Scraper de `scrapers/puntoticket` que adquiere, extrae y normaliza eventos de PuntoTicket.
- **Core_Scraper**: Paquete compartido `scrapers/core` (`@mishow/scraper-core`) con adquisición HTTP, políticas, normalización y persistencia.
- **Listado_Musica**: Página `https://www.puntoticket.com/musica`, fuente actual de descubrimiento.
- **Pagina_Venue**: Página de PuntoTicket dedicada a un recinto que lista sus eventos. Su URL es `https://www.puntoticket.com/<source_slug>` (p. ej. `/santander-arena`, `/claro-arena`), según la tabla Venue_Sources.
- **Indice_Venues**: Fuente desde la cual el Scraper_PuntoTicket obtiene las URLs de Pagina_Venue. Por decisión de TL/PO es la fuente `db-venues` (lectura de Venue_Sources); `fixed-list` queda como respaldo y para pruebas.
- **Venue_Sources**: Tabla `public.venue_sources` que asocia un venue canónico (`venues.id`) con su identificador y URL en una fuente/ticketera (`source`, `source_slug`, `source_url`).
- **Source_Slug**: Identificador del venue en la nomenclatura de una fuente concreta (para PuntoTicket, el segmento de ruta de la Pagina_Venue). Cada fuente define su propia nomenclatura.
- **Allowlist_Venues**: Conjunto exacto de rutas `/<source_slug>` permitidas para solicitudes secundarias, derivado del conjunto de Source_Slug de la fuente `puntoticket` en Venue_Sources.
- **Tope_Paginas_Venue**: Cantidad máxima de Paginas_Venue solicitadas por Corrida (`maxVenuePages`), con un tope duro (`maxVenuePagesLimit`), ambos configurables por variable de entorno.
- **Referencia_Evento**: Objeto `RawEventReference` con `source_url` canónica y `title` opcional.
- **Origen_Descubrimiento**: Etiqueta de la vía por la que se descubrió una Referencia_Evento: `musica` o `venue`.
- **Evento_Faltante**: Evento presente en alguna Pagina_Venue cuya `source_url` canónica no aparece en el Listado_Musica de la misma corrida.
- **Source_Url_Canonica**: Resultado de `canonicalSourceUrl` aplicado a la URL del evento; junto con `source` identifica de forma única un evento.
- **Politica_Adquisicion**: Reglas de `validateAcquisitionUrl`, `acquisitionDefaults` y `isBlockedPath` (HTTPS, host allowlist `www.puntoticket.com`, sin credenciales, rutas bloqueadas, límites de concurrencia y delay).
- **Corrida**: Una ejecución completa del Scraper_PuntoTicket, registrada en `scrape_runs`.
- **NormalizedEvent**: Contrato de `@mishow/domain` para un evento normalizado.
- **Reporte_Descubrimiento**: Resumen de la Corrida con conteos por Origen_Descubrimiento y la lista de Eventos_Faltantes.

## Requisitos

### Requisito 1: Descubrimiento de eventos desde páginas de venues

**Historia de usuario:** Como TL/PO de miShow, quiero que el scraper obtenga también los eventos listados en las páginas de venues de PuntoTicket, para que eventos ausentes de `/musica` no queden fuera del catálogo.

#### Criterios de aceptación

1. WHEN una Corrida con descubrimiento por venues habilitado inicia, THE Scraper_PuntoTicket SHALL obtener la lista de URLs de Pagina_Venue desde el Indice_Venues (fuente `db-venues`, tabla Venue_Sources con `source` = `puntoticket`).
2. WHEN el Scraper_PuntoTicket obtiene el HTML de una Pagina_Venue, THE Scraper_PuntoTicket SHALL extraer una Referencia_Evento por cada enlace de evento válido de esa página.
3. THE Scraper_PuntoTicket SHALL asignar a cada Referencia_Evento extraída de una Pagina_Venue el Origen_Descubrimiento `venue`.
4. WHEN una Pagina_Venue no contiene enlaces de evento, THE Scraper_PuntoTicket SHALL registrar la página como procesada con cero referencias y continuar con la siguiente Pagina_Venue.
5. IF el HTML de una Pagina_Venue no puede parsearse, THEN THE Scraper_PuntoTicket SHALL registrar un error con `stage` `parse` y la URL de esa Pagina_Venue, y continuar con las demás Paginas_Venue.
6. WHERE el descubrimiento por venues está deshabilitado (estado por defecto), THE Scraper_PuntoTicket SHALL ejecutar la Corrida únicamente con el Listado_Musica. La habilitación se rige por el Requisito 15.

### Requisito 2: Preservar el comportamiento actual de /musica

**Historia de usuario:** Como TL/PO, quiero que el flujo actual de `/musica` siga igual, para no introducir regresiones en la ingesta existente.

#### Criterios de aceptación

1. WHEN el Scraper_PuntoTicket procesa el Listado_Musica, THE Scraper_PuntoTicket SHALL producir las mismas Referencias_Evento que producía antes de esta feature para el mismo HTML de entrada.
2. THE Scraper_PuntoTicket SHALL mantener `https://www.puntoticket.com/musica` como `listingUrl` por defecto del adapter.
3. THE Scraper_PuntoTicket SHALL mantener la invocación `scrapePuntoTicket` existente compatible con sus consumidores actuales (CLI, persistencia y tests).
4. IF el descubrimiento por venues falla completamente, THEN THE Scraper_PuntoTicket SHALL conservar los eventos obtenidos desde el Listado_Musica en el resultado de la Corrida.
5. THE Scraper_PuntoTicket SHALL aplicar las reglas existentes de `parseMusicListing` sin modificación al Listado_Musica.

### Requisito 3: Diferenciación y detección de eventos faltantes

**Historia de usuario:** Como TL/PO, quiero identificar qué eventos de venues no estaban en `/musica`, para medir y auditar la cobertura adicional.

#### Criterios de aceptación

1. WHEN las Referencias_Evento de Listado_Musica y de Paginas_Venue están disponibles, THE Scraper_PuntoTicket SHALL comparar sus Source_Url_Canonica para clasificar cada referencia única.
2. THE Scraper_PuntoTicket SHALL clasificar como Evento_Faltante toda Source_Url_Canonica presente en al menos una Pagina_Venue y ausente del Listado_Musica de la misma Corrida.
3. WHEN una Source_Url_Canonica aparece en el Listado_Musica y en una o más Paginas_Venue, THE Scraper_PuntoTicket SHALL procesarla una sola vez y conservar `musica` y `venue` como Origenes_Descubrimiento.
4. WHEN una Source_Url_Canonica aparece en más de una Pagina_Venue, THE Scraper_PuntoTicket SHALL procesarla una sola vez.
5. THE Scraper_PuntoTicket SHALL comparar Source_Url_Canonica sin distinguir mayúsculas del host, barra final, parámetros de consulta ni fragmento.
6. THE Scraper_PuntoTicket SHALL generar un Reporte_Descubrimiento con el conteo de referencias únicas por Origen_Descubrimiento y la lista de Source_Url_Canonica de los Eventos_Faltantes.
7. THE Reporte_Descubrimiento SHALL satisfacer que la cantidad de referencias únicas totales sea igual a las únicas de `musica` más los Eventos_Faltantes.

### Requisito 4: Deduplicación entre corridas e ingesta idempotente

**Historia de usuario:** Como TL/PO, quiero que reejecutar la misma Corrida o descubrir un evento por ambas vías no genere duplicados, para mantener un catálogo consistente.

#### Criterios de aceptación

1. THE Scraper_PuntoTicket SHALL identificar cada evento por el par `source` = `puntoticket` y Source_Url_Canonica.
2. WHEN un evento descubierto por venue ya existe persistido con el mismo `source` y Source_Url_Canonica, THE Core_Scraper SHALL actualizar el registro existente sin crear uno nuevo.
3. WHEN la misma Corrida se ejecuta dos veces con las mismas entradas, THE Core_Scraper SHALL dejar el mismo conjunto de eventos persistidos que tras la primera ejecución.
4. WHEN un evento fue persistido por la vía `musica` y luego se descubre por la vía `venue`, THE Core_Scraper SHALL conservar un único evento.
5. IF una operación de persistencia se reintenta tras un fallo transitorio, THEN THE Core_Scraper SHALL producir el mismo resultado que una persistencia sin reintento.
6. THE Scraper_PuntoTicket SHALL emitir para cada evento un `NormalizedEvent` equivalente, con independencia del Origen_Descubrimiento.

### Requisito 5: Cumplimiento de la política de adquisición

**Historia de usuario:** Como TL/PO, quiero que el nuevo descubrimiento respete los límites hacia la fuente, para evitar bloqueos y cumplir las condiciones del sitio.

#### Criterios de aceptación

1. THE Scraper_PuntoTicket SHALL validar cada URL de Pagina_Venue con la Politica_Adquisicion antes de solicitarla (HTTPS, host `www.puntoticket.com`, sin credenciales, sin puerto distinto de 443).
2. IF una URL de Pagina_Venue incumple la Politica_Adquisicion, THEN THE Scraper_PuntoTicket SHALL omitir la solicitud y registrar un error con código `url_rejected`.
3. THE Scraper_PuntoTicket SHALL ejecutar todas las solicitudes de la Corrida (Listado_Musica, Paginas_Venue y detalles) con concurrencia máxima de 2.
4. THE Scraper_PuntoTicket SHALL esperar al menos 1000 ms entre solicitudes consecutivas a la fuente en toda la Corrida, incluidas las Paginas_Venue.
5. THE Scraper_PuntoTicket SHALL mantener bloqueadas las rutas de compra y cuenta ya definidas en `isBlockedPath` (`/queue`, `/comprar`, `/login`, `/registro`, `/carrito`, `/checkout`, `/pago`, `/cuenta`, entre otras) para las solicitudes a Paginas_Venue.
6. THE Scraper_PuntoTicket SHALL aplicar a las solicitudes de Paginas_Venue los límites vigentes de reintentos (máximo 2), redirecciones (máximo 3), timeout (máximo 30000 ms) y tamaño de HTML (máximo 2 MiB).
7. WHEN una redirección de una Pagina_Venue apunta fuera del host permitido o a una ruta bloqueada, THE Scraper_PuntoTicket SHALL rechazar la redirección y registrar `redirect_rejected`.
8. THE Scraper_PuntoTicket SHALL limitar la cantidad de Paginas_Venue solicitadas por Corrida al Tope_Paginas_Venue, según el Requisito 13 (sin constantes fijas inamovibles).
9. THE Scraper_PuntoTicket SHALL limitar la cantidad total de detalles de evento procesados por Corrida a `maxEvents`, con el tope `maxEventsLimit` vigente.
10. IF la fuente responde con bloqueo o limitación (HTTP 401, 403 o 429) en una Pagina_Venue, THEN THE Scraper_PuntoTicket SHALL registrar el error y no reintentar fuera de los límites de reintentos.
11. THE Scraper_PuntoTicket SHALL excluir de la adquisición toda ruta prohibida por el `robots.txt` de la fuente vigente al momento de la especificación (`/Pago*`, `/Confirma*`, `/Login*`, `/Categoria*`, `/Comprar*`, `/Envio*`, `/Direccion*`, `/Registro*`, `/Error*`, `/Register*`, `/Seleccion*`, `/SignIn*`).

### Requisito 6: Conservación de fuente, URL original y trazabilidad

**Historia de usuario:** Como TL/PO, quiero conservar la fuente y URL original de cada evento y saber cómo se descubrió, para auditar el origen de los datos.

#### Criterios de aceptación

1. THE Scraper_PuntoTicket SHALL conservar en cada `NormalizedEvent` el `source` `puntoticket` y la Source_Url_Canonica del evento, con independencia del Origen_Descubrimiento.
2. WHEN un evento se descubre desde una Pagina_Venue, THE Scraper_PuntoTicket SHALL usar como `source_url` la URL del evento y no la URL de la Pagina_Venue.
3. THE Scraper_PuntoTicket SHALL incluir en los errores de la Corrida la URL (sin credenciales ni fragmento) de la Pagina_Venue o del evento que los originó.
4. THE Core_Scraper SHALL asociar cada evento únicamente con el venue que declara su detalle, sin registrar la Pagina_Venue (ni la vía) desde la que se descubrió (decisión TL/PO: los venues ya existen en `venues`).
5. THE Core_Scraper SHALL registrar el `Reporte_Descubrimiento` en `scrape_runs.discovery_report` y también en el `ScrapeResult` y el resumen de salida del CLI (Requisito 14).

### Requisito 7: Fechas y zonas horarias explícitas

**Historia de usuario:** Como TL/PO, quiero que los eventos descubiertos por venue tengan fecha y zona horaria explícitas, para evitar errores de horario.

#### Criterios de aceptación

1. THE Scraper_PuntoTicket SHALL emitir cada `performance` de un evento descubierto por venue con `starts_at` en formato ISO 8601 con offset explícito y `timezone` en formato IANA.
2. WHEN el detalle de un evento descubierto por venue no contiene hora de inicio, THE Scraper_PuntoTicket SHALL aplicar el mismo tratamiento de hora desconocida que el flujo actual de `/musica`.
3. IF la fecha de una `performance` no puede determinarse, THEN THE Scraper_PuntoTicket SHALL registrar un error de normalización para ese evento y continuar con los demás.
4. THE Scraper_PuntoTicket SHALL derivar las fechas de un evento desde su página de detalle y no desde la información de la Pagina_Venue.

### Requisito 8: Tolerancia a fallos parciales y reintentos

**Historia de usuario:** Como TL/PO, quiero que el fallo de una página de venue no aborte la Corrida, para que la ingesta sea robusta.

#### Criterios de aceptación

1. IF la solicitud de una Pagina_Venue falla tras agotar los reintentos, THEN THE Scraper_PuntoTicket SHALL registrar un error con `stage` `listing` y la URL de la Pagina_Venue, y continuar con las demás.
2. IF la solicitud del Indice_Venues falla, THEN THE Scraper_PuntoTicket SHALL registrar un error global de descubrimiento por venues y completar la Corrida con el Listado_Musica.
3. IF la solicitud del Listado_Musica falla, THEN THE Scraper_PuntoTicket SHALL mantener el comportamiento actual de fallo global de la Corrida.
4. WHEN una Corrida termina con errores parciales, THE Scraper_PuntoTicket SHALL devolver los eventos exitosos y los errores en el mismo resultado.
5. THE Scraper_PuntoTicket SHALL contabilizar en el resumen de la Corrida las Paginas_Venue solicitadas, exitosas y fallidas.

### Requisito 9: Extracción de referencias desde páginas de venue (parser)

**Historia de usuario:** Como desarrollador, quiero un parser de Pagina_Venue verificable, para extraer referencias de forma confiable ante cambios de HTML.

#### Criterios de aceptación

1. WHEN se entrega el HTML de una Pagina_Venue al parser, THE parser de venues SHALL devolver Referencias_Evento con `source_url` canónica, sin duplicados dentro de la misma página.
2. THE parser de venues SHALL descartar enlaces con host distinto de `www.puntoticket.com`, con credenciales, con espacios externos o con rutas no permitidas.
3. THE parser de venues SHALL reutilizar las reglas de reconocimiento de enlaces de evento (`/evento/<slug>` y landings raíz con estructura de tarjeta de evento) usadas por `parseMusicListing`.
4. THE parser de venues SHALL extraer el `title` de la Referencia_Evento cuando la tarjeta lo provea.
5. THE formateador de Referencias_Evento SHALL producir una representación serializada de la lista de referencias, y FOR ALL listas válidas de Referencias_Evento, serializar, parsear y serializar de nuevo SHALL producir una lista equivalente (propiedad de ida y vuelta).

### Requisito 10: Extensión del contrato SourceAdapter en el core

**Historia de usuario:** Como desarrollador, quiero extender el core de forma compatible, para que otras fuentes (p. ej. Ticketmaster) no se vean afectadas.

#### Criterios de aceptación

1. WHERE un adapter declara descubrimiento secundario, THE Core_Scraper SHALL ejecutar la adquisición de ese descubrimiento además del listado principal.
2. WHILE un adapter no declara descubrimiento secundario, THE Core_Scraper SHALL comportarse de forma idéntica a la versión previa.
3. THE Core_Scraper SHALL mantener sin cambios el contrato `NormalizedEvent` de `@mishow/domain`.
4. THE Core_Scraper SHALL aplicar la misma validación `validateAcquisitionUrl` y los mismos límites del `HttpClient` a todas las etapas de descubrimiento.

### Requisito 11: Modelo de datos `venue_sources` (fuente de verdad del índice)

**Historia de usuario:** Como TL/PO, quiero una tabla que relacione cada venue con su identificador y URL en cada ticketera, para construir enlaces a la ticketera y alimentar el descubrimiento sin listas fijas en código.

#### Criterios de aceptación

1. THE Core_Scraper SHALL disponer de la tabla `public.venue_sources` con las columnas `venue_id` (bigint, FK a `venues(id)` con `on delete cascade`), `source` (text), `source_slug` (text), `source_url` (text), `created_at`, `updated_at` y `last_seen_at`.
2. THE tabla `venue_sources` SHALL imponer unicidad sobre el par (`source`, `source_slug`).
3. THE tabla `venue_sources` SHALL imponer que `source` y `source_slug` no sean vacíos tras `btrim` y que `source_url` cumpla el patrón HTTPS sin espacios (`^https://[^[:space:]]+$`).
4. THE tabla `venue_sources` SHALL tener RLS habilitado con lectura pública (`anon`, `authenticated`) y escritura (`insert`, `update`) solo para `service_role`, coherente con las demás tablas del catálogo (`20260913223740_canonical_events_model.sql`).
5. THE Core_Scraper SHALL definir `source_url` para la fuente `puntoticket` como `https://www.puntoticket.com/<source_slug>`; otras fuentes pueden definir otra nomenclatura de `source_slug` y `source_url`.
6. WHEN la migración se aplica, THE Core_Scraper SHALL poblar `venue_sources` para `source` = `puntoticket` derivando `source_slug` de `venues.slug` de cada venue existente cuyo slug cumpla `^[a-z0-9]+(-[a-z0-9]+)*$`.
7. WHEN el poblado derivado se ejecuta más de una vez, THE Core_Scraper SHALL dejar el mismo conjunto de filas sin duplicados ni errores (idempotencia por `on conflict (source, source_slug) do nothing`).
8. THE documentación SHALL declarar el supuesto de que `venues.slug` coincide con el slug de PuntoTicket y que `venue_sources` puede corregirse posteriormente (fila a fila) sin cambiar código.

### Requisito 12: Fuente de índice `db-venues` y allowlist exacta

**Historia de usuario:** Como TL/PO, quiero que el scraper tome los venues desde la base y solo solicite esas rutas, para evitar colisiones con landings de eventos que también cuelgan de la raíz del sitio.

#### Criterios de aceptación

1. THE Scraper_PuntoTicket SHALL ofrecer una fuente de índice `db-venues` que lee las filas de Venue_Sources con `source` = `puntoticket` mediante el módulo de persistencia (Data API) existente y devuelve sus `source_url`.
2. THE Scraper_PuntoTicket SHALL construir la Allowlist_Venues como el conjunto exacto de rutas `/<source_slug>` de las filas leídas, sin aceptar un patrón genérico `/<slug>`.
3. WHEN una URL de Pagina_Venue tiene una ruta fuera de la Allowlist_Venues, THE Scraper_PuntoTicket SHALL omitir la solicitud y registrar `url_rejected`.
4. THE Scraper_PuntoTicket SHALL aplicar `isBlockedPath` a las rutas de la Allowlist_Venues; una ruta bloqueada se rechaza aunque exista en Venue_Sources.
5. IF la lectura de Venue_Sources falla, THEN THE Scraper_PuntoTicket SHALL registrar `venue_index_failed` y completar la Corrida con el Listado_Musica.
6. IF una fila de Venue_Sources tiene `source_url` que no coincide con `https://www.puntoticket.com/<source_slug>`, THEN THE Scraper_PuntoTicket SHALL omitir esa fila y registrar un error `url_rejected`.
7. WHERE se configura la fuente `fixed-list`, THE Scraper_PuntoTicket SHALL usarla en lugar de `db-venues` (respaldo y pruebas), con el mismo comportamiento de allowlist exacta.
8. FOR ALL conjuntos de filas de Venue_Sources válidas, THE `source_url` derivada de cada fila SHALL ser canónica (`canonicalSourceUrl(source_url) = source_url`) y la Allowlist_Venues SHALL ser igual al conjunto de sus `source_slug`.

### Requisito 13: Topes configurables de páginas de venue

**Historia de usuario:** Como TL/PO, quiero ajustar por entorno cuántas páginas de venue se solicitan, para escalar la cobertura sin recompilar y sin relajar la cortesía hacia la fuente.

#### Criterios de aceptación

1. THE Scraper_PuntoTicket SHALL leer `maxVenuePages` de la variable `PUNTOTICKET_MAX_VENUE_PAGES`; si no está definida, THE Scraper_PuntoTicket SHALL usar el valor por defecto de `MAX_EVENTS` vigente.
2. THE Scraper_PuntoTicket SHALL leer el tope duro `maxVenuePagesLimit` de la variable `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT`; si no está definida, THE Scraper_PuntoTicket SHALL usar el valor de `MAX_EVENTS_LIMIT` vigente.
3. THE Scraper_PuntoTicket SHALL solicitar como máximo `min(maxVenuePages, maxVenuePagesLimit)` Paginas_Venue por Corrida.
4. IF `PUNTOTICKET_MAX_VENUE_PAGES` o `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT` es un valor no entero, negativo o mayor que su tope, THEN THE Scraper_PuntoTicket SHALL rechazar la configuración con un error descriptivo.
5. WHERE el flag `--max-venue-pages` se entrega por CLI, THE Scraper_PuntoTicket SHALL darle prioridad sobre la variable de entorno, dentro del tope duro.
6. THE Scraper_PuntoTicket SHALL mantener sin cambios la concurrencia máxima de 2, la pausa mínima de 1000 ms entre solicitudes y el máximo de 2 reintentos.

### Requisito 14: Persistencia del reporte de descubrimiento en `scrape_runs`

**Historia de usuario:** Como TL/PO, quiero consultar el reporte de descubrimiento de cada Corrida en la base, para auditar la cobertura adicional en el tiempo.

#### Criterios de aceptación

1. THE tabla `scrape_runs` SHALL incluir la columna `discovery_report` de tipo `jsonb`, nula por defecto, que acepte solo `null` o un objeto JSON (`jsonb_typeof = 'object'`).
2. WHEN una Corrida con descubrimiento ejecutado finaliza, THE Core_Scraper SHALL persistir el Reporte_Descubrimiento en `scrape_runs.discovery_report` de esa Corrida.
3. WHILE una Corrida no ejecutó descubrimiento, THE Core_Scraper SHALL dejar `scrape_runs.discovery_report` en `null`.
4. THE Core_Scraper SHALL incluir el Reporte_Descubrimiento también en el `ScrapeResult` y en la salida JSON del CLI.
5. THE contrato de persistencia (`FinishRunInput` y su validación) SHALL aceptar `discovery_report` opcional sin romper a los llamadores actuales (Ticketmaster y PuntoTicket sin descubrimiento).
6. WHEN la finalización de una Corrida se reintenta con el mismo `discovery_report`, THE Core_Scraper SHALL dejar el mismo valor persistido (idempotencia).
7. THE `discovery_report` persistido SHALL contener solo URLs canónicas y conteos, sin credenciales ni fragmentos.

### Requisito 15: Activación por variable de entorno

**Historia de usuario:** Como TL/PO, quiero habilitar el descubrimiento por venues en producción mediante una variable de entorno, para activarlo sin cambiar el comando de ejecución.

#### Criterios de aceptación

1. THE Scraper_PuntoTicket SHALL mantener el descubrimiento por venues deshabilitado por defecto.
2. WHERE la variable `PUNTOTICKET_VENUE_DISCOVERY` vale `true`, THE Scraper_PuntoTicket SHALL habilitar el descubrimiento por venues.
3. WHERE el flag CLI `--venue-discovery` está presente, THE Scraper_PuntoTicket SHALL habilitar el descubrimiento por venues con independencia de la variable.
4. IF `PUNTOTICKET_VENUE_DISCOVERY` tiene un valor distinto de `true` o `false`, THEN THE Scraper_PuntoTicket SHALL rechazar la configuración con un error descriptivo.
5. THE Scraper_PuntoTicket SHALL tratar `PUNTOTICKET_VENUE_DISCOVERY` ausente o igual a `false` como deshabilitado.

### Requisito 16: Documentación y alcance operativo

**Historia de usuario:** Como TL/PO, quiero que las decisiones y variables queden documentadas, para operar y auditar la feature.

#### Criterios de aceptación

1. THE documentación en `docs/` SHALL describir `venue_sources`, la fuente `db-venues`, el supuesto de slug derivado, las variables `PUNTOTICKET_VENUE_DISCOVERY`, `PUNTOTICKET_MAX_VENUE_PAGES` y `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT`, y la columna `scrape_runs.discovery_report`.
2. THE `.env.example` SHALL documentar las variables nuevas sin valores reales ni secretos.
3. THE documentación SHALL indicar que el scraper opera en modo estudio y que debe evitarse dañar la infraestructura del sitio (cortesía sin cambios), sin ampliar el alcance legal de la feature.

## Decisiones de TL/PO

Resueltas (reemplazan las Preguntas abiertas originales):

| # | Tema | Decisión |
|---|---|---|
| 1 | Índice de venues y patrón de URL | Fuente `db-venues` sobre la tabla `venue_sources`; URL `https://www.puntoticket.com/<source_slug>`; poblado inicial derivado de `venues.slug` (Req. 11, 12). |
| 2 | Volumen / topes | `maxVenuePages` configurable por entorno, por defecto alineado con `MAX_EVENTS`; tope duro configurable, por defecto `MAX_EVENTS_LIMIT` (Req. 13). |
| 3 | Presupuesto de peticiones | Cortesía sin cambios: concurrencia ≤ 2, pausa ≥ 1000 ms, ≤ 2 reintentos (Req. 5, 13.6). |
| 4 | Persistir venue de origen | No se persiste (Req. 6.4). |
| 5 | Ubicación del reporte | `scrape_runs.discovery_report` además de `ScrapeResult` y CLI (Req. 14). |
| 6 | Categorías | Sin cambios: sin filtro por categoría. |
| 7 | Eventos pasados o agotados | Sin cambios: tratamiento actual del detalle. |
| 8 | Activación | Apagado por defecto; se habilita con `PUNTOTICKET_VENUE_DISCOVERY=true` o `--venue-discovery` (Req. 15). |
| 9 | 403/429 | Sin cambios: se registra el error y se continúa (Req. 5.10). |
| 10 | Allowlist y términos de uso | Allowlist exacta derivada de `venue_sources`, rutas bloqueadas siguen aplicando (Req. 12). Términos de uso: modo estudio, solo nota en docs (Req. 16.3). |

Pendientes: ninguna decisión bloqueante. Supuesto a validar luego: que `venues.slug` coincida con el slug de PuntoTicket (corregible en `venue_sources`).
