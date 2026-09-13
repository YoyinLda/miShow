-- Frescura pública del catálogo por fuente.
--
-- Objetivo: exponer al frontend (rol anon) cuándo se actualizó por última vez el
-- catálogo, sin filtrar datos operativos sensibles de scrape_runs/scrape_errors.
--
-- Decisión de diseño (por qué una FUNCTION y no una VIEW):
--   public.scrape_runs tiene RLS habilitado y permanece privada: solo service_role
--   recibe grants y no existe policy de lectura para anon/authenticated. Queremos
--   que siga siendo así (no exponer listing_url, parameters ni contadores de fallo).
--
--   Una vista con security_invoker = true se ejecutaría como anon y no podría leer
--   scrape_runs (devolvería vacío). Una vista con security_invoker = false expone la
--   tabla con privilegios del owner, pero el linter la marca como "Security Definer
--   View" (error) por saltarse RLS de forma implícita.
--
--   Se elige una función SECURITY DEFINER acotada, expuesta por la Data API como RPC
--   (mismo patrón que las RPC de persistencia ya existentes). La función:
--     - fija search_path vacío y califica cada relación;
--     - devuelve SOLO columnas no sensibles (source, último término, estado y
--       contadores no sensibles) de la última corrida succeeded/partial por fuente;
--     - concede EXECUTE únicamente a anon, authenticated y service_role.
--   Las funciones no están sujetas a RLS; su superficie se controla con el GRANT
--   EXECUTE y con lo que la función selecciona explícitamente.
create function public.catalog_freshness_v1(p_source text default null)
returns table (
  source text,
  last_run_finished_at timestamptz,
  last_run_status text,
  discovered_count integer,
  succeeded_count integer
)
language sql
security definer
set search_path = ''
stable
as $$
  select distinct on (run.source_id)
    src.code as source,
    run.finished_at as last_run_finished_at,
    run.status as last_run_status,
    run.discovered_count,
    run.succeeded_count
  from public.scrape_runs as run
  join public.sources as src on src.id = run.source_id
  where run.status in ('succeeded', 'partial')
    and (p_source is null or src.code = p_source)
  order by run.source_id, run.started_at desc;
$$;

revoke all on function public.catalog_freshness_v1(text) from public;
grant execute on function public.catalog_freshness_v1(text) to anon, authenticated, service_role;
