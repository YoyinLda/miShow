# Operación del scraping programado (cron) — PuntoTicket

Este documento describe cómo opera el scraping automático de PuntoTicket con
persistencia idempotente en Supabase, cómo configurarlo, cómo interpretar sus
resultados y cómo mantenerlo dentro de la capa gratuita.

El workflow vive en `.github/workflows/scrape-puntoticket.yml`. No despliega
infraestructura ni crea recursos pagados: solo ejecuta el scraper existente con
`--live --persist` de forma programada.

> **Multi-fuente:** Ticketmaster tiene su propio workflow independiente,
> `.github/workflows/scrape-ticketmaster.yml`, con horarios desfasados
> (`0 13 * * *` y `0 23 * * *`) para no solapar carga. Comparte los mismos
> secrets (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`), las mismas variables
> (`MAX_EVENTS`, `MAX_EVENTS_LIMIT`) y los mismos límites de throttling
> (concurrency 2, delay 1500ms). La persistencia es idempotente y por
> `source_id`, así que ambas fuentes conviven sin interferencia. Todo lo descrito
> abajo para PuntoTicket aplica igual a Ticketmaster cambiando el comando por
> `npm --silent run ticketmaster:scrape -- --live --persist ...`.

## Frecuencia y racional

Frecuencia conservadora: **2 ejecuciones al día**, con pocos eventos por corrida.

- Horarios (UTC): `0 12 * * *` y `0 22 * * *`.
- Equivalencia en Chile (UTC-3 en verano, UTC-4 en invierno):
  - 12:00 UTC ≈ 08:00–09:00 (mañana).
  - 22:00 UTC ≈ 18:00–19:00 (tarde/noche).

El objetivo es reflejar el catálogo completo de `/musica` sin golpear la fuente
en exceso y sin acercarse a los límites gratuitos de GitHub Actions. El listado
entrega hoy ~48 eventos en un solo HTML (la "paginación" del sitio es cosmética),
así que la corrida hace **1 request al listado** y **1 request de detalle por
evento**, con throttling responsable. El volumen se controla por las variables
de entorno `MAX_EVENTS` (default 60) y `MAX_EVENTS_LIMIT` (tope 200).

## Comando exacto

El workflow ejecuta:

```bash
npm --silent run puntoticket:scrape -- \
  --live \
  --persist \
  --concurrency 2 \
  --delay-ms 1500 \
  --timeout-ms 15000
```

- `--live` habilita la adquisición HTTP real de PuntoTicket.
- `--persist` valida la configuración (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`)
  **antes** de adquirir y persiste vía RPC atómicas.
- El volumen ya no se pasa por `--max-events`: se toma de `MAX_EVENTS` /
  `MAX_EVENTS_LIMIT` (variables del repositorio en el workflow, con default
  60/200). Si se entrega el flag `--max-events`, éste tiene prioridad sobre el
  entorno.
- Los límites (`concurrency`, `delay-ms`, `timeout-ms`) son respetuosos con la
  fuente y coinciden con la política de adquisición documentada en
  `docs/ejecucion-fixture-first-puntoticket.md`.

## Secrets requeridos

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Valor | Notas |
|---|---|---|
| `SUPABASE_URL` | URL de la Data API del proyecto (`https://<ref>.supabase.co`) | Sin barra final; sin credenciales embebidas. |
| `SUPABASE_SECRET_KEY` | Secret key del servidor de Supabase | **Nunca** una clave publishable/anon. Solo servidor/CLI. |

Reglas de seguridad:

- La secret key solo se usa en el runner (server-side), nunca en el navegador.
- No se imprime en logs: la salida JSON del scraper no incluye credenciales y los
  errores se sanitizan.
- No versionar `.env` ni pegar secretos en archivos del repositorio.

## Ejecución manual

El workflow tiene `workflow_dispatch`: en la pestaña **Actions → Scrape
PuntoTicket → Run workflow** se puede lanzar una corrida a demanda (por ejemplo
para validar por primera vez tras cargar los secrets).

## Interpretación de resultados

La salida del scraper es un único JSON en stdout que incluye, entre otros,
`run_id`, `status` y `summary`.

- `run_id`: identificador de la corrida en `scrape_runs`. Sirve para rastrear
  eventos y errores de esa ejecución.
- `status`:
  - `succeeded`: todos los eventos intentados se persistieron sin errores ni
    advertencias.
  - `partial`: hubo éxitos y también errores o advertencias. La corrida **no**
    falla el job (se persistió lo que se pudo).
  - `failed`: no se persistió ningún evento (fallo global o corrida totalmente
    fallida). El job termina con exit code `1` y aparece en rojo en Actions.
- `summary.discovered / attempted / succeeded / failed`: conteos de la corrida.

Códigos de salida:

- `0`: `succeeded` o `partial`.
- `1`: fallo global, corrida totalmente fallida o configuración inválida.

## Detección de fallos sin revisión diaria

El job falla visiblemente (rojo en la pestaña **Actions**) cuando el scraper
retorna exit code `1`. GitHub notifica los fallos de workflows programados según
la configuración de notificaciones de la cuenta. No es necesario revisar cada
día: basta atender las corridas fallidas.

Una corrida `partial` (exit `0`) no falla el job pero deja errores/advertencias
registrados en `scrape_errors` asociados al `run_id`. La frescura pública
(`catalog_freshness_v1`) considera `succeeded` y `partial` como corridas
publicables; una corrida `failed` no reemplaza la última frescura buena.

## Consumo vs. cuota gratuita

GitHub Free otorga (según la documentación consultada) 2.000 minutos/mes de
Actions para repositorios privados; los repositorios públicos con runners
estándar no consumen minutos pagados.

Estimación conservadora: 2 corridas/día × ~2–4 min cada una ≈ 120–240 min/mes,
muy por debajo del límite. `npm ci` con cache de dependencias mantiene el tiempo
por corrida acotado.

Umbrales de atención sugeridos:

- Revisar el consumo mensual de Actions si supera ~50 % de la cuota.
- Alertar/ajustar antes del 70–80 %.
- Si una corrida se acerca a `timeout-minutes: 15`, investigar la causa antes de
  subir el timeout.

## Pausar o ajustar

- **Pausar temporalmente:** en **Actions**, seleccionar el workflow y usar
  *Disable workflow*. También puede comentarse el bloque `schedule` en el YAML.
- **Cambiar frecuencia:** editar las líneas `cron` en
  `.github/workflows/scrape-puntoticket.yml` (recordar que están en UTC).
- **Cambiar volumen:** ajustar las variables `MAX_EVENTS` (default 60) y
  `MAX_EVENTS_LIMIT` (tope 200) en **Settings → Secrets and variables → Actions
  → Variables**. No requiere editar el YAML. El máximo admitido por la política
  es `MAX_EVENTS_LIMIT`.
- **Concurrencia/pausa:** `--concurrency` (máx. 2) y `--delay-ms` (mín. 1000)
  cambian la presión sobre la fuente; mantenerlos bajos.

## Runbook de validación local (pre-cron)

Antes de conectar el cron conviene validar la ruta de persistencia contra un
Supabase local (Docker), sin depender de un entorno remoto.

Requisitos: Docker con el daemon iniciado y `npm ci` ejecutado.

```bash
npm run supabase:start          # levanta el stack local e imprime URL y llaves
npm run supabase:reset          # aplica migraciones desde cero
```

Exportar la URL y la **secret key** locales (las imprime `supabase:start`) a un
`.env` no versionado y cargarlas al entorno del proceso:

```bash
set -a; . ./.env; set +a
MAX_EVENTS=5 npm --silent run puntoticket:scrape -- --live --persist --concurrency 2 --delay-ms 1500
```

Verificaciones esperadas:

1. La salida JSON incluye `run_id` y `status`.
2. Repetir exactamente el comando **no** duplica eventos (idempotencia).
3. `catalog_events_v1` refleja los eventos persistidos.
4. `catalog_freshness_v1` refleja la última corrida `succeeded`/`partial`.

### Evidencia de validación

La ruta de persistencia se validó localmente ejercitando exactamente las RPC del
cron (`start_scrape_run`, `persist_normalized_event`, `finish_scrape_run`) contra
Supabase local, con un resultado de scraping controlado (sin golpear la fuente
real). Resultado observado:

- Corrida 1: `status: succeeded`, `discovered/attempted/succeeded = 1`, `failed = 0`.
- Corrida 2 (idéntica): `status: succeeded`.
- Conteo de eventos: `1` tras la corrida 1 y sigue en `1` tras la corrida 2
  (**idempotencia confirmada**, sin duplicados).
- `catalog_freshness_v1` devolvió únicamente columnas no sensibles
  (`source`, `last_run_finished_at`, `last_run_status`, `discovered_count`,
  `succeeded_count`).

> La adquisición `--live` real (HTTP a PuntoTicket) ocurre en el runner de GitHub
> Actions, no como parte de esta validación local, para respetar los límites y
> condiciones de la fuente.

## Rollback

Este workflow no modifica el esquema ni despliega recursos. Para desactivar el
scraping automático basta deshabilitar el workflow o revertir el archivo YAML.
Los datos ya persistidos no se ven afectados por esa acción.
