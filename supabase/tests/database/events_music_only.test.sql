-- Brief 007: category en persist_normalized_event y vistas públicas solo música.
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

set local role service_role;

select lives_ok(
  $$
    select public.start_scrape_run(jsonb_build_object(
      'source', 'puntoticket',
      'listing_url', 'https://www.puntoticket.com/musica',
      'started_at', '2026-11-14T12:00:00Z',
      'parameters', jsonb_build_object('max_events', 3)
    ))
  $$,
  'a service role starts a run'
);

create temporary table t_event(payload jsonb) on commit drop;
insert into t_event values ($event${
  "source":"puntoticket",
  "source_url":"https://www.puntoticket.com/evento/partido-x",
  "extracted_at":"2026-11-14T12:00:00Z",
  "name":"Club A vs Club B",
  "status":"available",
  "category":"deportes",
  "artists":[{"name":"Club A","normalized_name":"club a","position":0}],
  "venue":{"name":"Estadio X","normalized_name":"estadio x","city":"Santiago"},
  "performances":[{"starts_at":"2099-01-01T23:00:00Z","timezone":"America/Santiago","status":"available"}]
}$event$::jsonb);

select lives_ok(
  $$ select public.persist_normalized_event((select max(id) from public.scrape_runs), (select payload from t_event)) $$,
  'a categorized event is persisted'
);
select is((select category from public.events where name = 'Club A vs Club B'), 'deportes', 'new event takes the payload category');
select is((select count(*) from public.catalog_events_v2 where name = 'Club A vs Club B'), 0::bigint, 'non-music events are hidden from catalog_events_v2');
select is((select count(*) from public.catalog_artists_v1 where name = 'Club A'), 0::bigint, 'artists only in non-music events are hidden');

-- Sin category en el payload: se conserva la vigente.
select lives_ok(
  $$ select public.persist_normalized_event((select max(id) from public.scrape_runs), (select payload - 'category' from t_event)) $$,
  'an uncategorized payload is persisted'
);
select is((select category from public.events where name = 'Club A vs Club B'), 'deportes', 'missing category keeps the current one');

-- La música gana: reclasificar a musica lo vuelve visible.
select public.persist_normalized_event(
  (select max(id) from public.scrape_runs),
  (select jsonb_set(payload, '{category}', '"musica"') from t_event)
);
select is((select count(*) from public.catalog_events_v2 where name = 'Club A vs Club B'), 1::bigint, 'reclassified music events are visible again');

select * from finish();
rollback;
