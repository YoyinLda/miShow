# Persistencia PuntoTicket en Supabase

## Alcance implementado

La persistencia recibe exclusivamente `NormalizedEvent`; no interpreta HTML ni
realiza adquisición. La CLI conserva el flujo sin base de datos por defecto y
activa la persistencia solo con `--persist`.

El adaptador usa la Data API mediante cuatro RPC:

- `start_scrape_run`: crea una corrida breve en estado `running`;
- `persist_normalized_event`: ejecuta una transacción atómica por evento;
- `record_scrape_error`: registra un error o warning sanitizado;
- `finish_scrape_run`: finaliza la corrida con sus contadores.

Las llamadas HTTP ocurren fuera de las transacciones de base de datos. El
adaptador reintenta como máximo dos veces y únicamente ante SQLSTATE `40001` o
`40P01`.

## Modelo e idempotencia

La migración `supabase/migrations/20260909151251_puntoticket_persistence.sql`
crea:

- `sources`;
- `events`;
- `performances`;
- snapshots `event_artists` y `event_venues`;
- tablas operacionales `scrape_runs` y `scrape_errors`;
- vista pública `catalog_events_v1`.

Los identificadores internos son `bigint generated always as identity`. Las
identidades naturales son `events(source_id, source_url)` y
`performances(event_id, starts_at)`. `source_code` y `performance_code` son
atributos observados, no identidades.

El upsert usa `INSERT ... ON CONFLICT` y orden determinista. Una observación
anterior no reemplaza una nueva; valores vacíos no borran información,
`unknown` no pisa estados informativos, un nombre placeholder no pisa un nombre
real y las ausencias no eliminan funciones, artistas ni recinto. Si solo llega
un extremo de precio y al combinarlo con el extremo retenido el rango quedaría
invertido, se conserva completo el rango válido anterior; un rango nuevo
completo o un extremo parcial compatible sí se actualiza. Una colisión de
`source_code` conserva ambos eventos y registra `duplicate_source_code`. Una
fecha nueva sin identidad externa fiable conserva fechas antiguas y registra
`possible_performance_date_correction`.

El registro de errores es secundario y de mejor esfuerzo: si falla no reemplaza
el error de adquisición o persistencia que lo originó, ni impide intentar la
finalización de la corrida con su `run_id` y estado calculado. Un fallo de la
finalización sigue siendo crítico y se conserva como causa del error global.

## Seguridad y catálogo

Todas las tablas de `public` tienen RLS habilitado. `anon` y `authenticated`
solo reciben `SELECT` sobre las tablas de catálogo y la vista
`catalog_events_v1`; no pueden leer corridas/errores, escribir tablas ni ejecutar
las RPC privadas. La vista usa `security_invoker = true`.

Las RPC son `SECURITY INVOKER`, fijan `search_path` vacío, califican las
relaciones y solo conceden `EXECUTE` a `service_role`. El servidor/CLI usa
`SUPABASE_SECRET_KEY` en el header `apikey`; no se envía como `Authorization` y
nunca debe exponerse con un prefijo `NEXT_PUBLIC_`.

## Instalación y Supabase local

Requisitos:

- Node.js `>=20.18.1`;
- Docker con el daemon iniciado;
- dependencias instaladas con `npm ci`.

La CLI oficial queda fijada como `supabase@2.117.0` en `devDependencies`. Los
comandos siguientes son locales y no enlazan ni modifican un proyecto remoto:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run supabase:lint
npm run supabase:advisors
```

`supabase:reset` reaplica las migraciones sobre la base local y descarta datos
locales. `supabase:test` ejecuta las pruebas pgTAP de
`supabase/tests/database/`. `supabase:lint` y `supabase:advisors` consultan solo
el stack local mediante sus flags `--local`.

## Configuración del scraper

Copia `.env.example` a un archivo `.env` no versionado y completa sus valores
con la URL API y la Secret key que muestra el stack local, o inyéctalos desde el
gestor de secretos del runtime:

```dotenv
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

La aplicación no carga `.env` automáticamente. Las variables deben existir en
el entorno del proceso. Sin `--persist` no se leen ni se usan y la salida sigue
siendo el JSON original del scraper.

Para una ejecución persistida explícita:

```bash
npm --silent run puntoticket:scrape -- --live --persist --max-events 1
```

Con `--persist`, la configuración se valida antes de cualquier adquisición. La
salida JSON incluye `run_id` y `status`. `succeeded` y `partial` terminan con
exit code `0`; una falla global, una corrida totalmente fallida o una
configuración inválida terminan con exit code `1`. Los mensajes se escriben en
`stderr` sin incluir secretos.

## Retención, rollback y operación

La retención queda documentada, sin cron ni borrado automático:

- corridas exitosas: 90 días;
- corridas parciales o fallidas: 180 días;
- corridas `running` con más de 2 horas: abandonadas para revisión manual o una
  automatización futura aprobada.

Durante desarrollo, el rollback consiste en revertir el cambio de migración y
ejecutar nuevamente `npm run supabase:reset` sobre el stack local. Para un
entorno compartido se requiere respaldo y una migración inversa revisada antes
de actuar; esta historia no despliega ni modifica entornos remotos.

## Verificación esperada

```bash
npm test
npm run typecheck
npm run lint
git diff --check
TZ=America/Santiago npm test
```

Con Docker disponible, agregar los comandos locales de Supabase indicados
arriba. La suite pgTAP cubre creación y replay, merge parcial y temporal,
funciones nuevas, códigos opcionales, warnings por colisión/corrección, rollback,
sanitización, finalización, foreign keys y permisos públicos.
