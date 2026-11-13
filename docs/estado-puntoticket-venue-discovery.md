# Estado: descubrimiento de eventos por venue (PuntoTicket)

Spec: `.kiro/specs/puntoticket-venue-discovery`. Estado al 2026-11-13: en producción
y funcionando. Guía de uso y variables: `ejecucion-fixture-first-puntoticket.md`.

## Qué se hizo

- **Core (`scrapers/core`)**: descubrimiento secundario enchufable (`SecondaryDiscovery`),
  unión y deduplicación de referencias por URL canónica (`/musica` primero), reporte
  `DiscoveryReport`, presupuestos de solicitudes y tolerancia a fallos parciales.
- **PuntoTicket**: `parseVenuePage`, fuente `db-venues` con allowlist exacta de rutas,
  `fixed-list` como respaldo, CLI `--venue-discovery` / `PUNTOTICKET_VENUE_DISCOVERY`.
- **Topes configurables**: `PUNTOTICKET_MAX_VENUE_PAGES` y `_LIMIT`.
- **Base de datos** (migraciones `20261005…` a `20261009…`, aplicadas en prod):
  `venue_sources` (slug por ticketera, único por `source` + `source_slug`),
  `scrape_runs.discovery_report`, `finish_scrape_run` que lo persiste, trigger que crea
  una fila candidata por cada venue nuevo, estado `candidate | active | not_found` con
  reintento de `not_found` tras N días y RPC `record_venue_source_checks`. El venue
  Munich se cargó por migración.
- **CI**: `scrape-puntoticket.yml` pasa las variables del descubrimiento. Variables del
  repo: `PUNTOTICKET_VENUE_DISCOVERY=true`, `PUNTOTICKET_MAX_VENUE_PAGES=30`,
  `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT=200`, `PUNTOTICKET_VENUE_NOTFOUND_RETRY_DAYS=30`,
  `MAX_EVENTS=200`.

## Hallazgos de la puesta en producción

- Las páginas de venue se renderizan con Vue: los eventos vienen como JSON embebido
  (`{"eventoID":…,"urlCompra":…}`), no como tarjetas HTML. El parser lee `urlCompra`
  de esos registros (fix en PR #25). Hasta ese fix, el descubrimiento devolvía 0.
- Muchos slugs derivados de `venues.slug` dan 404: PuntoTicket tiene pocos recintos con
  página. El estado `not_found` evita gastar cupo en ellos en cada corrida.
- Un BOM UTF-8 en dos migraciones rompió el preview de Supabase (corregido, PR #23).
  Al escribir SQL con PowerShell 5 usar UTF-8 sin BOM.

## Resultado de la corrida 186 (manual, producción)

| Métrica | Valor |
|---|---|
| Descubiertos / guardados | 132 / 132, sin fallos |
| Solo `/musica` · solo venue · ambas | 48 · 121 · 37 |
| Faltantes en `/musica` (guardados) | 84 |
| Páginas de venue pedidas / OK | 5 / 5 |
| `venue_sources` | 5 `active`, 42 `not_found` |
| Estado | `partial` por 1 advertencia ajena (`ambiguous performance purchase mapping`) |

Dónde mirarlo: Actions → *Scrape PuntoTicket* → job `scrape` → paso *Scrape and persist*
(JSON final con `summary`, `discovery`, `errors`), y en la base `scrape_runs.discovery_report`
y `venue_sources.status`.

## Pendientes y riesgos conocidos

- Slug `item` en `venue_sources`: probable artefacto; revisar y eliminar.
- Duplicados de venue con slugs distintos (`cupula-parque-ohiggins` / `cupula-parque-o-higgins`,
  `estadio-nacional` / `parque-estadio-nacional`).
- `munich` responde 200 pero sin eventos en el HTML: queda `active` sin aportar.
- Duración: con `MAX_EVENTS=200` y más venues activos, la corrida puede acercarse al
  timeout de 20 min del job.
- `santander-arena` devuelve 49 refs (más que todo `/musica`): confirmar que la página no
  lista el catálogo completo, para que `missing` no se infle.
- Tests de bug-condition de Ticketmaster (8) fallan en `npm test`; son de otro spec.
- `.agents/assets/` y `.agents/tasks/` sin versionar.

## Próximos pasos propuestos

1. **Monitoreo** (corto): revisar 2 a 3 corridas programadas; confirmar duración, que
   `missing_count` sea estable y que `not_found` no crezca sin control.
2. **Depurar `venue_sources`**: eliminar `item`, unificar duplicados y confirmar a mano
   los recintos `active`; definir si los `not_found` se archivan.
3. **Alerta por fallo del descubrimiento**: avisar si `venue_pages.failed` supera un umbral
   o si `venue_index_failed` aparece; hoy solo queda en `scrape_errors`.
4. **Origen del venue en el evento**: hoy no se persiste de qué página vino; decidir si
   sirve para enriquecer `event_venues` (decisión de TL/PO).
5. **Otras ticketeras**: `venue_sources` ya admite slug por fuente; extender
   `ensure_venue_source_candidates` y el trigger a nuevas fuentes.
6. **Advertencia de mapeo de compra**: mejorar el extractor de detalle para
   `ambiguous performance purchase mapping` y que la corrida no quede `partial`.
7. **Ticketmaster**: cerrar el bugfix de los 8 tests de bug-condition para que `npm run qa`
   pase completo.