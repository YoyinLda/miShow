# Instalación y pruebas fixture-first de PuntoTicket

Este documento describe cómo preparar y verificar la base actual de PuntoTicket
en miShow. El alcance es local y fixture-first: el sistema recibe HTML, extrae
referencias y detalles, normaliza eventos y expone resultados en memoria. No
incluye persistencia, publicación ni scraping en vivo.

## Prerrequisitos

- Node.js >=20.19.0 (el proyecto y CI usan 24.21.0). Este mínimo lo fijan las
  dependencias de desarrollo `vite@7` y `eslint-visitor-keys@5` del
  `package-lock.json` (`cheerio@1.2.0` exige >=20.18.1).
- npm incluido con Node.js.
- Git, si se necesita revisar el diff o clonar el repositorio.
- Una terminal ubicada en la raíz del repositorio, donde están
  `package.json` y `package-lock.json`.

No se necesitan credenciales, variables de entorno, PostgreSQL, Playwright,
Puppeteer, navegador, login ni acceso a una cuenta de PuntoTicket para ejecutar
las pruebas.

## Instalación normal

Desde la raíz del repositorio:

```bash
npm install
```

`npm install` instala las dependencias declaradas y puede actualizar el lockfile
si npm detecta una diferencia compatible. No ejecuta scraping ni contacta a
PuntoTicket; únicamente puede requerir acceso al registro de paquetes durante
la instalación.

## Instalación limpia y reproducible

Para reconstruir las dependencias desde cero conservando el lockfile:

```bash
rm -rf node_modules
npm ci
```

`npm ci` exige que `package-lock.json` sea compatible con `package.json`,
elimina cualquier `node_modules` existente y reinstala las versiones fijadas.
No se debe eliminar ni regenerar el lockfile para una verificación normal.

En PowerShell, el equivalente de la limpieza es:

```powershell
Remove-Item -Recurse -Force node_modules
npm ci
```

La limpieza es razonable cuando se sospecha de una instalación incompleta o se
quiere reproducir el entorno de CI. No es necesaria antes de cada ejecución.

## Verificación completa

Ejecutar estos comandos desde la raíz, preferentemente en este orden:

```bash
npm test
npm run typecheck
npm run lint
git diff --check
```

También están disponibles de forma explícita los comandos de instalación:

```bash
npm install
npm ci
```

En una verificación concreta se usa `npm install` o `npm ci`, no ambos como
pasos obligatorios consecutivos. Para repetir exactamente la instalación
reproducible, usar `npm ci` después de la limpieza indicada arriba.

## Zona horaria

La normalización conserva la zona horaria explícita `America/Santiago` y
resuelve fechas locales sin offset usando las reglas de `Intl`. Los tests no
dependen de la zona horaria del proceso, por lo que no es obligatorio definir
`TZ`. Para hacer explícita una ejecución en un entorno POSIX:

```bash
TZ=America/Santiago npm test
```

En PowerShell:

```powershell
$env:TZ = "America/Santiago"
npm test
```

La suite cubre offsets de invierno y verano, fechas locales sin offset y el
rechazo de una hora local inexistente durante el cambio horario. El soporte de
la zona depende de que el runtime de Node.js tenga datos de `Intl` disponibles.

## Alcance de las pruebas

El comando `npm test` ejecuta Vitest sobre las suites
`tests/puntoticket.test.ts` y `tests/puntoticket-acquisition.test.ts`. Las suites
comprueban, entre otros casos:

- extracción de eventos desde rutas relativas y absolutas;
- descubrimiento de tarjetas reales del listado (`article.filtr-item.event-item`,
  `.evento--box`, `img.img--evento`) cuyos enlaces son landings públicas raíz
  (`/<slug>`), además de la ruta canónica `/evento/<slug>`;
- exclusión de rutas que no son eventos y de la ruta raíz;
- evidencia estructural para landings y deduplicación;
- combinación de HTML y JSON-LD, incluyendo tipos `Event` completos;
- funciones múltiples, estados disponibles, agotados, próximos y desconocidos;
- identificadores por performance y enlaces de cola de compra;
- rechazo de enlaces inseguros, externos o que no son rutas de cola válidas;
- JSON-LD inválido reportado en `ExtractionResult.errors` sin perder el HTML;
- fechas calendario inválidas y fechas locales deterministas en
  `America/Santiago`;
- precio, moneda, artistas, fuente y URL original en la normalización;
- rechazo de URLs de performance inválidas sin conservar estado comprable;
- imagen HTTPS, coordenadas, `extracted_at` obligatorio y precios vacíos o
  inválidos sin conversión accidental a cero.

Los fixtures son HTML sintético mantenido en:

- `tests/fixtures/puntoticket-functions.html`;
- `tests/fixtures/puntoticket-qa-regressions.html`;
- `tests/fixtures/puntoticket-metadata.html`.

Además, el archivo de tests construye casos HTML pequeños directamente para
cubrir regresiones y límites específicos. Ningún fixture representa una
petición en vivo ni debe interpretarse como autorización para consultar la
fuente real.

La separación actual es:

1. extracción: HTML a referencias o datos extraídos;
2. normalización: datos extraídos a eventos con contratos del dominio;
3. persistencia: todavía fuera de esta base fixture-first;
4. presentación/publicación: todavía fuera de esta base.

## CLI local sin red

Las entradas CLI reutilizan los extractores y el normalizador; no contienen
lógica de parsing duplicada:

```bash
npm --silent run puntoticket:listing -- <ruta-html> [base-url]
npm --silent run puntoticket:detail -- <ruta-html> <source-url> <extracted-at>
```

Ambas muestran ayuda con `--help`, escriben JSON válido en stdout cuando se
invocan con `npm --silent run` (el banner normal de `npm run` no es JSON), y reportan
errores de argumentos o archivos con código distinto de cero. La CLI de
detalle exige `<extracted-at>` como timestamp ISO-8601 con zona horaria y
calendario real, y usa exactamente ese valor para `extracted_at`; no lo genera
automáticamente. Si se omite o es inválido, termina con código distinto de
cero. Las advertencias de JSON-LD o fechas rechazadas se informan en stderr sin
descargar imágenes ni seguir enlaces.

La validación manual de HTML real de `.local` es solo local y no versiona ni
copia esos archivos. Los fixtures versionados son mínimos y sintéticos.

## CLI HTTP manual

La adquisición HTTP controlada se ejecuta únicamente con una señal explícita:

```bash
npm --silent run puntoticket:scrape -- \
  --live \
  --listing-url https://www.puntoticket.com/musica \
  --concurrency 2 \
  --delay-ms 1500 \
  --timeout-ms 15000
```

El volumen se controla por entorno (`MAX_EVENTS`, `MAX_EVENTS_LIMIT`); el flag
`--max-events` sigue disponible y, si se entrega, tiene prioridad sobre el
entorno.

Usar `npm --silent run` evita que el banner de npm contamine stdout. En éxito
completo o parcial, stdout contiene un único JSON con `source`, timestamps,
`listing_url`, `summary`, `events` y `errors`. Los fallos globales, argumentos
inválidos o ausencia de `--live` escriben solo en stderr y terminan con código
distinto de cero.

Límites vigentes:

- solo HTTPS en `www.puntoticket.com`, sin userinfo y con puerto estándar;
- listing permitido: `/musica` o `/musica/`;
- detalles live permitidos: `/evento/...` y landings públicas raíz de un
  segmento solamente cuando fueron descubiertas por `parseMusicListing`;
- redirecciones manuales, máximo 3, validando cada `Location`;
- `Accept: text/html, application/xhtml+xml` y `User-Agent:
  miShow-puntoticket-acquisition/0.1`;
- concurrencia default 2, máximo 2;
- pausa default 1500 ms, mínimo 1000 ms, aplicada por limitador global;
- timeout por solicitud default 15000 ms, máximo 30000 ms;
- máximo 2 reintentos adicionales solo para timeout, error de red y HTTP
  408/429/500/502/503/504;
- `Retry-After` se respeta hasta el máximo configurado;
- HTML máximo 2 MiB y solo `text/html` o `application/xhtml+xml`;
- `max-events` default 60 (env `MAX_EVENTS`), máximo 200 (env `MAX_EVENTS_LIMIT`).
  El listado de `/musica` entrega la totalidad de eventos (~48) en un solo HTML;
  la paginación del sitio es cosmética, por lo que basta 1 request al listado.

La adquisición no sigue `purchase_url`, no descarga imágenes, no usa cookies,
Authorization, sesión, Playwright, PostgreSQL ni infraestructura externa. Las
pruebas reemplazan transporte, reloj y espera para seguir siendo deterministas
y no abrir sockets.

### Descubrimiento por venue (opcional)

Segunda vía de descubrimiento además de `/musica`: páginas de venue que pueden
listar eventos que `/musica` no muestra. **Desactivado por defecto**; sin
`--venue-discovery` el comportamiento y la salida JSON son idénticos a los
anteriores.

```bash
# Fuente por defecto db-venues (requiere SUPABASE_URL y SUPABASE_SECRET_KEY)
npm --silent run puntoticket:scrape -- --live --venue-discovery --persist

# Respaldo / pruebas: lista fija (prevalece sobre db-venues)
npm --silent run puntoticket:scrape -- --live --venue-discovery \
  --venue-url https://www.puntoticket.com/<source_slug>
```

#### Variables y flags

| Variable / flag | Efecto |
|---|---|
| `PUNTOTICKET_VENUE_DISCOVERY` / `--venue-discovery` | Habilita la vía. Valores válidos de la variable: `true` o `false`; otro valor es error de uso. Ausente = `false`. El flag habilita con independencia de la variable. |
| `PUNTOTICKET_MAX_VENUE_PAGES` / `--max-venue-pages <n>` | Páginas de venue por corrida. Default = `MAX_EVENTS`. El flag, si se entrega, prevalece. |
| `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT` | Tope duro de páginas de venue. Default = `MAX_EVENTS_LIMIT`. El valor efectivo no puede superarlo (si lo hace, error). |
| `--venue-url <url>` / `PUNTOTICKET_VENUE_URLS` | Lista fija (coma-separada en la variable); respaldo y pruebas. Si existe, se usa en vez de `db-venues`. |

Los ejemplos de variables están en `.env.example`, sin valores reales.

#### Fuente `db-venues` y tabla `venue_sources`

`public.venue_sources` (migración `20261005120000_venue_sources.sql`) asocia un
venue canónico (`venues.id`) con su identificador y URL en una ticketera:
`source`, `source_slug`, `source_url`, único por (`source`, `source_slug`);
`source_url` debe ser HTTPS. Lectura pública por RLS; escritura solo
`service_role`.

Con la vía habilitada y sin lista fija, el índice `db-venues` lee las filas con
`source = 'puntoticket'` y solicita `https://www.puntoticket.com/<source_slug>`.
Las filas cuya `source_url` no coincida con ese patrón se omiten. La allowlist
de rutas secundarias es exacta (`/<source_slug>` de las filas válidas); las
rutas bloqueadas siguen aplicando. Si la lectura de la tabla falla, la corrida
registra `venue_index_failed` y continúa con `/musica`.

**Supuesto de slug derivado:** el poblado inicial
(`backfill_venue_sources_puntoticket()`, idempotente, no sobrescribe filas)
asume que `venues.slug` coincide con el slug de la página de venue en
PuntoTicket. No está verificado. Si un slug no coincide, se corrige **fila a
fila** actualizando `venue_sources.source_slug` y `source_url` de esa fila con
`service_role`; el backfill no la volverá a pisar.

#### Reporte en `scrape_runs.discovery_report`

La columna `scrape_runs.discovery_report` (jsonb, objeto o null; migración
`20261006120000_scrape_runs_discovery_report.sql`) guarda el `DiscoveryReport`
(solo URLs canónicas y conteos). `finish_scrape_run` la persiste (migración
`20261007120000_finish_scrape_run_discovery_report.sql`); queda null si no hubo
descubrimiento. El reporte también va en `ScrapeResult` y en el JSON del CLI.

#### Impacto en tiempo de corrida

Cada página de venue es una solicitud adicional con la misma cortesía de
siempre: pausa ≥ 1 s entre solicitudes (limitador global) y concurrencia ≤ 2.
Con N páginas, la corrida añade al menos ~N × 1 s (con el default de 1500 ms,
~N × 1,5 s), más los detalles nuevos que aparezcan. Ajustar
`PUNTOTICKET_MAX_VENUE_PAGES` según la duración aceptable del workflow.

#### Modo estudio

El scraper opera en modo estudio: debe evitarse dañar la infraestructura del
sitio, por lo que los límites de cortesía no se relajan. Esta feature no amplía
el alcance legal ni sustituye la revisión de los términos de uso de la fuente.

Las referencias de `/musica` y de venue se unen y deduplican por `source_url`
canónica (las de `/musica` van primero, así `--max-events` nunca las desplaza).
Los detalles siguen el pipeline existente, con los mismos límites de cortesía
(pausa ≥ 1000 ms, concurrencia ≤ 2, reintentos ≤ 2). Una página de venue que
falla se registra en `errors` (etapa `listing` o `parse`) y la corrida continúa.

Con el flag, el JSON agrega `discovery` (`DiscoveryReport`):

```ts
interface DiscoveryReport {
  musica_unique: number;   // refs únicas de /musica
  venue_unique: number;    // refs únicas de las páginas de venue
  both: number;            // en ambas vías
  missing_count: number;   // solo en venue (no estaban en /musica)
  total_unique: number;    // unión; = musica_unique + missing_count
  missing: string[];       // source_url canónicas de los faltantes
  venue_pages: { requested: number; succeeded: number; failed: number };
}
```

Invariantes: `venue_unique = both + missing_count`;
`requested = succeeded + failed`.

Rutas bloqueadas: `/Categoria`, `/Confirma`, `/Envio`, `/Direccion`, `/Error`,
`/Register` y `/SignIn` se agregaron a `isBlockedPath` (se rechazan como venue,
listado o detalle).

**Decisiones de TL/PO (resueltas)** (ver `requirements.md` del spec
`puntoticket-venue-discovery`):

- Índice: `db-venues` sobre `venue_sources`; `fixed-list` solo respaldo/pruebas.
- Topes: `PUNTOTICKET_MAX_VENUE_PAGES` (default `MAX_EVENTS`) y
  `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT` (default `MAX_EVENTS_LIMIT`).
- Cortesía sin cambios: concurrencia ≤ 2, pausa ≥ 1000 ms, ≤ 2 reintentos.
- El venue de origen no se persiste; sin cambios en `NormalizedEvent`.
- El reporte se guarda en `scrape_runs.discovery_report` (además de
  `ScrapeResult` y CLI). La migración de `finish_scrape_run` que lo persiste
  está hecha.
- Sin filtro de categoría ni de eventos pasados/agotados.
- Ante 403/429 (tras reintentos) se registra el error y se continúa.
- Apagado por defecto; se activa con `PUNTOTICKET_VENUE_DISCOVERY=true` o
  `--venue-discovery`.
- Términos de uso: modo estudio, solo nota en docs.

Sin decisiones bloqueantes pendientes. Único supuesto por validar: que
`venues.slug` coincida con el slug de PuntoTicket (corregible en
`venue_sources`).

## Restricciones deliberadas

Las pruebas deben continuar siendo locales, deterministas e idempotentes:

- no hacen llamadas de red ni siguen enlaces de compra;
- no usan Playwright, Puppeteer ni un navegador;
- no realizan compra, login ni acceso a cuentas;
- no requieren PostgreSQL, migraciones ni otra base de datos;
- no despliegan ni crean recursos externos;
- no usan credenciales productivas;
- no incorporan cobros ni servicios de infraestructura.

Los enlaces de fuente y compra se analizan como datos. La URL de compra solo se
conserva cuando cumple las reglas del adaptador de PuntoTicket; no se abre. Hoy
solo se acepta `https://www.puntoticket.com/queue/enqueue/<codigo>` o
`https://www.puntoticket.com/comprar/evento/<codigo>/cal/<calendario>`, sin
credenciales, sin hosts parecidos, sin HTTP y sin puertos alternativos. Para la
ruta `/comprar/evento/.../cal/...`, el `performance_code` corresponde al codigo
del evento, no al calendario.

El extractor reconoce disponibilidad comprable desde controles visibles y
habilitados, incluyendo `data-buyLink` con variaciones de mayusculas/minusculas
en el nombre del atributo, `.icon-status.available` dentro de un bloque de
funcion y enlaces validos de compra a nivel publicacion. Botones `disabled`,
`aria-disabled` u ocultos no generan disponibilidad comprable por si solos.

`horasPorFecha` solo se procesa cuando el valor asignado es un literal JSON
estricto, acotado, balanceado y determinista. El extractor acepta la estructura
real de objeto `fecha -> funciones[]` y conserva compatibilidad con variantes
planas seguras. En la estructura real, cada funcion debe entregar `Fecha`
valida y sus `BuyLinks`; solo se consideran links con `Disabled:false`. Para
`/comprar/evento/<codigo>/cal/<calendario>`, el codigo de funcion se toma de la
URL permitida y, en la estructura nested con `/comprar/evento/.../cal/...`, `EventoCalendarioId` es obligatorio y debe coincidir con el segmento
`cal`. Las variantes planas deben mantener `Codigo` y `Calendario` explicitos y
consistentes con la URL. No se ejecuta JavaScript, no se usa `eval` y no se
infieren asociaciones desde `cal`, `ct`, imagenes, posicion visual o texto
legal. Cuando existen enlaces de compra validos pero no hay relacion segura con
funciones especificas, el evento puede quedar globalmente `available`, las
funciones quedan `unknown` y se reporta la advertencia exacta
`ambiguous performance purchase mapping`.

## Troubleshooting básico

### `npm ci` falla por incompatibilidad del lockfile

Verificar que se está usando el `package.json` y `package-lock.json` del mismo
checkout y Node.js >=20.19.0. No corregirlo borrando el lockfile. Si la
incompatibilidad persiste, debe tratarse como cambio de dependencias y revisarse
antes de modificar archivos del repositorio.

### No existe `npm`

Instalar Node.js >=20.19.0 mediante el método aprobado por el equipo y
volver a abrir la terminal. Confirmar con:

```bash
node --version
npm --version
```

### `npm test` falla por módulos no encontrados

Repetir la instalación limpia:

```bash
rm -rf node_modules
npm ci
npm test
```

En Windows, usar el comando PowerShell de limpieza descrito arriba.

### El test de fecha depende del entorno

Ejecutar con `TZ=America/Santiago` como se indica en la sección de zona
horaria y verificar que Node.js incluya datos de `Intl`. No cambiar los fixtures
para acomodar la zona local de una máquina.

### `git diff --check` reporta errores

Revisar espacios al final de línea y líneas nuevas en los archivos indicados.
Este comando no modifica archivos.

### Lint o typecheck fallan

Leer primero el archivo y la línea reportados. No desactivar reglas ni agregar
dependencias como solución. Si el fallo aparece en un checkout limpio, dejar
la evidencia en el handoff y escalarlo al TL/PO.

## Riesgos y pendientes

- La suite valida parsers y normalización, no el HTML actual de PuntoTicket ni
  cambios que solo aparezcan en producción.
- No hay prueba de integración con Playwright, red, colas, PostgreSQL, API o
  presentación.
- La deduplicación comprobada es la del pipeline en memoria; la persistencia
  idempotente y sus restricciones PostgreSQL aún requieren una historia propia.
- La compatibilidad real del origen, sus límites, bloqueos y condiciones de uso
  deben revisarse antes de habilitar scraping programado.
- La decisión de incorporar navegador, persistencia o infraestructura sigue
  fuera de este documento y requiere alcance y aprobación separados.

## Handoff para QA

Validar en un checkout limpio que:

1. `npm ci` termina sin cambiar el lockfile.
2. `npm test`, `npm run typecheck` y `npm run lint` terminan correctamente.
3. `git diff --check` no reporta errores.
4. La suite corre sin red, credenciales, navegador ni PostgreSQL.
5. La ejecución con `TZ=America/Santiago npm test` produce el mismo resultado.
6. Los casos cubiertos por ambos fixtures siguen representando datos
   sintéticos y no contienen secretos ni datos personales.

No se requiere compra, login, despliegue ni acceso a la fuente real para este
handoff.

### Candidatos por ticketera y estado de enue_sources

Migraci�n 20261009120000_venue_sources_status.sql. Cada ticketera puede tener un
slug distinto por venue (�nico por source + source_slug; un venue puede tener
varias filas, una por fuente).

- Todo venue nuevo recibe por trigger una fila **candidata** por fuente conocida
  (puntoticket), con source_slug = venues.slug. ensure_venue_source_candidates(source)
  hace lo mismo para los existentes y no pisa venues que ya tienen fila de esa fuente
  (as� se respetan los slugs corregidos a mano).
- status: candidate (sin verificar), ctive (la p�gina respondi�) o 
ot_found (404).
- Con --venue-discovery --persist la corrida registra tras terminar ctive (HTTP 200)
  o 
ot_found (HTTP 404) v�a ecord_venue_source_checks. Timeouts, 429 y 5xx no
  cambian el estado. Si el registro falla, solo se escribe una advertencia en stderr.
- Orden de consulta: ctive, candidate, 
ot_found vencidas. Una 
ot_found se
  reintenta pasados PUNTOTICKET_VENUE_NOTFOUND_RETRY_DAYS d�as (default 30), as� los
  404 no gastan cupo de PUNTOTICKET_MAX_VENUE_PAGES en cada corrida.
- Para corregir un slug de una ticketera: actualizar source_slug/source_url de esa
  fila con service_role y dejar status = 'candidate'.

Nota: las páginas de venue de PuntoTicket traen los eventos como JSON embebido (Vue) y no como tarjetas HTML; parseVenuePage lee urlCompra de esos registros. Estado en producción y próximos pasos: [estado-puntoticket-venue-discovery.md](estado-puntoticket-venue-discovery.md).
