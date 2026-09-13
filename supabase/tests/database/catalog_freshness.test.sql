begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- La frescura se expone como función RPC SECURITY DEFINER, no como vista, para
-- mantener scrape_runs/scrape_errors privadas y evitar el lint "Security Definer View".
select has_function('public', 'catalog_freshness_v1', array['text'], 'freshness RPC exists');
select ok(
  (
    select procedure.prosecdef
      and pg_catalog.array_to_string(procedure.proconfig, ',') like '%search_path=%'
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = 'catalog_freshness_v1'
  ),
  'freshness RPC is security definer with an explicit search_path'
);
select ok(pg_catalog.has_function_privilege('anon', 'public.catalog_freshness_v1(text)', 'execute'), 'anon can execute the freshness RPC');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.catalog_freshness_v1(text)', 'execute'), 'authenticated can execute the freshness RPC');
select ok(not pg_catalog.has_table_privilege('anon', 'public.scrape_runs', 'select'), 'anon cannot read operational runs directly');
select ok(not pg_catalog.has_table_privilege('anon', 'public.scrape_errors', 'select'), 'anon cannot read operational errors directly');

-- Poblar corridas: una succeeded antigua, una partial reciente y una failed más nueva.
set local role service_role;

select public.start_scrape_run(jsonb_build_object(
  'source', 'puntoticket',
  'listing_url', 'https://www.puntoticket.com/musica',
  'started_at', '2026-09-10T10:00:00Z',
  'parameters', jsonb_build_object('max_events', 2)
));
select public.finish_scrape_run(
  (select max(id) from public.scrape_runs),
  '{"finished_at":"2026-09-10T10:05:00Z","status":"succeeded","discovered_count":5,"attempted_count":5,"succeeded_count":5,"failed_count":0,"warnings_count":0,"snapshot_complete":true}'::jsonb
);

select public.start_scrape_run(jsonb_build_object(
  'source', 'puntoticket',
  'listing_url', 'https://www.puntoticket.com/musica',
  'started_at', '2026-09-11T10:00:00Z',
  'parameters', jsonb_build_object('max_events', 2)
));
select public.finish_scrape_run(
  (select max(id) from public.scrape_runs),
  '{"finished_at":"2026-09-11T10:06:00Z","status":"partial","discovered_count":4,"attempted_count":4,"succeeded_count":3,"failed_count":1,"warnings_count":1,"snapshot_complete":false}'::jsonb
);

-- Una corrida failed más reciente NO debe convertirse en la frescura publicada.
select public.start_scrape_run(jsonb_build_object(
  'source', 'puntoticket',
  'listing_url', 'https://www.puntoticket.com/musica',
  'started_at', '2026-09-12T10:00:00Z',
  'parameters', jsonb_build_object('max_events', 2)
));
select public.finish_scrape_run(
  (select max(id) from public.scrape_runs),
  '{"finished_at":"2026-09-12T10:02:00Z","status":"failed","discovered_count":0,"attempted_count":0,"succeeded_count":0,"failed_count":0,"warnings_count":0,"snapshot_complete":false}'::jsonb
);

reset role;

-- La frescura refleja la última corrida succeeded/partial (la partial reciente),
-- ignorando la failed posterior.
select is(
  (select last_run_status from public.catalog_freshness_v1('puntoticket')),
  'partial',
  'freshness reflects the latest succeeded/partial run and ignores a newer failed run'
);
select is(
  (select last_run_finished_at from public.catalog_freshness_v1('puntoticket')),
  '2026-09-11T10:06:00Z'::timestamptz,
  'freshness exposes the finished_at of the latest successful/partial run'
);
select is(
  (select discovered_count::text || '|' || succeeded_count::text from public.catalog_freshness_v1('puntoticket')),
  '4|3',
  'freshness exposes non-sensitive counters from the latest run'
);
select is(
  (select count(*) from public.catalog_freshness_v1(null)),
  1::bigint,
  'freshness returns a single row per source'
);

select * from finish();
rollback;
