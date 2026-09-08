# Instalación y pruebas fixture-first de PuntoTicket

Este documento describe cómo preparar y verificar la base actual de PuntoTicket
en miShow. El alcance es local y fixture-first: el sistema recibe HTML, extrae
referencias y detalles, normaliza eventos y expone resultados en memoria. No
incluye persistencia, publicación ni scraping en vivo.

## Prerrequisitos

- Node.js >=20.18.1. Este mínimo coincide con la dependencia efectiva
  `cheerio@1.2.0` declarada en `package-lock.json`.
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

El comando `npm test` ejecuta Vitest sobre `tests/puntoticket.test.ts`. La suite
comprueba, entre otros casos:

- extracción de eventos desde rutas relativas y absolutas;
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
  --max-events 2 \
  --concurrency 1 \
  --delay-ms 1500 \
  --timeout-ms 15000
```

Usar `npm --silent run` evita que el banner de npm contamine stdout. En éxito
completo o parcial, stdout contiene un único JSON con `source`, timestamps,
`listing_url`, `summary`, `events` y `errors`. Los fallos globales, argumentos
inválidos o ausencia de `--live` escriben solo en stderr y terminan con código
distinto de cero.

Límites vigentes:

- solo HTTPS en `www.puntoticket.com`, sin userinfo y con puerto estándar;
- listing permitido: `/musica` o `/musica/`;
- detalles live permitidos: `/evento/...`;
- redirecciones manuales, máximo 3, validando cada `Location`;
- `Accept: text/html, application/xhtml+xml` y `User-Agent:
  miShow-puntoticket-acquisition/0.1`;
- concurrencia default 1, máximo 2;
- pausa default 1500 ms, mínimo 1000 ms, aplicada por limitador global;
- timeout por solicitud default 15000 ms, máximo 30000 ms;
- máximo 2 reintentos adicionales solo para timeout, error de red y HTTP
  408/429/500/502/503/504;
- `Retry-After` se respeta hasta el máximo configurado;
- HTML máximo 2 MiB y solo `text/html` o `application/xhtml+xml`;
- `max-events` default 10, máximo 50.

La adquisición no sigue `purchase_url`, no descarga imágenes, no usa cookies,
Authorization, sesión, Playwright, PostgreSQL ni infraestructura externa. Las
pruebas reemplazan transporte, reloj y espera para seguir siendo deterministas
y no abrir sockets.

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
conserva cuando cumple las reglas del adaptador de PuntoTicket; no se abre.

## Troubleshooting básico

### `npm ci` falla por incompatibilidad del lockfile

Verificar que se está usando el `package.json` y `package-lock.json` del mismo
checkout y Node.js >=20.18.1. No corregirlo borrando el lockfile. Si la
incompatibilidad persiste, debe tratarse como cambio de dependencias y revisarse
antes de modificar archivos del repositorio.

### No existe `npm`

Instalar Node.js >=20.18.1 mediante el método aprobado por el equipo y
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
