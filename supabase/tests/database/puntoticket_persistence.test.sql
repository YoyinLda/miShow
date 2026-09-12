begin;

create extension if not exists pgtap with schema extensions;

select plan(65);

select has_table('public', 'sources', 'sources exists');
select has_table('public', 'events', 'events exists');
select has_table('public', 'performances', 'performances exists');
select has_table('public', 'event_artists', 'event_artists exists');
select has_table('public', 'event_venues', 'event_venues exists');
select has_table('public', 'scrape_runs', 'scrape_runs exists');
select has_table('public', 'scrape_errors', 'scrape_errors exists');
select has_view('public', 'catalog_events_v1', 'catalog view exists');

select ok(
  (
    select count(*) = 7 and bool_and(class.relrowsecurity)
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in ('sources', 'events', 'performances', 'event_artists', 'event_venues', 'scrape_runs', 'scrape_errors')
  ),
  'RLS is enabled on every public table'
);

select ok(
  (
    select count(*) = 4
      and bool_and(not procedure.prosecdef)
      and bool_and(pg_catalog.array_to_string(procedure.proconfig, ',') like '%search_path=%')
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('start_scrape_run', 'persist_normalized_event', 'record_scrape_error', 'finish_scrape_run')
  ),
  'all persistence RPCs are security invoker with an explicit search_path'
);

select ok(pg_catalog.has_table_privilege('anon', 'public.catalog_events_v1', 'select'), 'anon can read the catalog view');
select ok(pg_catalog.has_table_privilege('authenticated', 'public.catalog_events_v1', 'select'), 'authenticated can read the catalog view');
select ok(not pg_catalog.has_table_privilege('anon', 'public.events', 'insert'), 'anon cannot insert events');
select ok(not pg_catalog.has_table_privilege('authenticated', 'public.events', 'insert'), 'authenticated cannot insert events');
select ok(not pg_catalog.has_table_privilege('anon', 'public.scrape_runs', 'select'), 'anon cannot read operational runs');
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.persist_normalized_event(bigint,jsonb)', 'execute'),
  'anon cannot execute persistence RPCs'
);

set local role service_role;

select lives_ok(
  $$
    select public.start_scrape_run(jsonb_build_object(
      'source', 'puntoticket',
      'listing_url', 'https://www.puntoticket.com/musica',
      'started_at', '2026-09-09T12:00:00Z',
      'parameters', jsonb_build_object('max_events', 3)
    ))
  $$,
  'a service role starts a run'
);

select is((select status from public.scrape_runs order by id desc limit 1), 'running', 'the run starts as running');

select lives_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      $event${
        "source":"puntoticket",
        "source_url":"https://www.puntoticket.com/evento/A",
        "source_code":"SHARED",
        "extracted_at":"2026-09-09T12:00:00Z",
        "name":"Evento A",
        "status":"available",
        "purchase_url":"https://www.puntoticket.com/queue/enqueue/A",
        "price":{"min":10000,"max":20000,"currency":"CLP"},
        "artists":[
          {"name":"Ana Tijoux","normalized_name":"ana tijoux","position":0},
          {"name":"Victor Jara","normalized_name":"victor jara","position":1}
        ],
        "venue":{"name":"Teatro Municipal","normalized_name":"teatro municipal","address":"Agustinas 794","city":"Santiago"},
        "performances":[{
          "starts_at":"2026-12-12T23:00:00Z",
          "timezone":"America/Santiago",
          "status":"available",
          "purchase_url":"https://www.puntoticket.com/queue/enqueue/A"
        }]
      }$event$::jsonb
    )
  $sql$,
  'the first normalized event is persisted atomically'
);

select is((select count(*) from public.events), 1::bigint, 'the first event is inserted once');
select is((select count(*) from public.performances), 1::bigint, 'the first performance is inserted once');

select lives_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      $event${
        "source":"puntoticket",
        "source_url":"https://www.puntoticket.com/evento/A",
        "source_code":"SHARED",
        "extracted_at":"2026-09-09T12:00:00Z",
        "name":"Evento A",
        "status":"available",
        "purchase_url":"https://www.puntoticket.com/queue/enqueue/A",
        "price":{"min":10000,"max":20000,"currency":"CLP"},
        "artists":[
          {"name":"Ana Tijoux","normalized_name":"ana tijoux","position":0},
          {"name":"Victor Jara","normalized_name":"victor jara","position":1}
        ],
        "venue":{"name":"Teatro Municipal","normalized_name":"teatro municipal","address":"Agustinas 794","city":"Santiago"},
        "performances":[{"starts_at":"2026-12-12T23:00:00Z","timezone":"America/Santiago","status":"available","purchase_url":"https://www.puntoticket.com/queue/enqueue/A"}]
      }$event$::jsonb
    )
  $sql$,
  'an identical event can be replayed'
);

select is(
  (select (select count(*) from public.events) + (select count(*) from public.performances)),
  2::bigint,
  'an identical replay creates no event or performance duplicates'
);

select lives_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      $event${
        "source":"puntoticket",
        "source_url":"https://www.puntoticket.com/evento/A",
        "source_code":"SHARED",
        "extracted_at":"2026-09-09T13:00:00Z",
        "name":"Evento A actualizado",
        "status":"unknown",
        "price":{"min":15000},
        "artists":[{"name":"Ana Tijoux","normalized_name":"ana tijoux","position":0}],
        "venue":{"city":"Santiago Centro"},
        "performances":[
          {"starts_at":"2026-12-12T23:00:00Z","timezone":"America/Santiago","status":"unknown"},
          {"starts_at":"2026-12-13T23:00:00Z","timezone":"America/Santiago","status":"sold_out"}
        ]
      }$event$::jsonb
    )
  $sql$,
  'a newer partial observation merges conservatively'
);

select is(
  (select name || '|' || status || '|' || price_min::text || '|' || price_max::text || '|' || currency || '|' || purchase_url from public.events),
  'Evento A actualizado|available|15000.00|20000.00|CLP|https://www.puntoticket.com/queue/enqueue/A',
  'unknown and missing event fields do not erase informative values'
);
select is((select count(*) from public.performances), 2::bigint, 'a new performance is added and the absent one is retained');
select is((select count(*) from public.event_artists), 2::bigint, 'an absent artist is not deleted');
select is(
  (select name || '|' || address || '|' || city from public.event_venues),
  'Teatro Municipal|Agustinas 794|Santiago Centro',
  'missing venue fields do not erase the snapshot'
);

select lives_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      '{"source":"puntoticket","source_url":"https://www.puntoticket.com/evento/A","extracted_at":"2026-09-09T13:10:00Z","name":"Evento A actualizado","status":"available","price":{"min":25000},"artists":[],"performances":[]}'::jsonb
    )
  $sql$,
  'a crossed newer minimum does not abort the event'
);
select is(
  (select price_min::text || '|' || price_max::text from public.events where source_url like '%/A'),
  '15000.00|20000.00',
  'a partial minimum above the retained maximum keeps the valid price range'
);

select lives_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      '{"source":"puntoticket","source_url":"https://www.puntoticket.com/evento/A","extracted_at":"2026-09-09T13:20:00Z","name":"Evento A actualizado","status":"available","price":{"max":5000},"artists":[],"performances":[]}'::jsonb
    )
  $sql$,
  'a crossed newer maximum does not abort the event'
);
select is(
  (select price_min::text || '|' || price_max::text from public.events where source_url like '%/A'),
  '15000.00|20000.00',
  'a partial maximum below the retained minimum keeps the valid price range'
);

select lives_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      $event${
        "source":"puntoticket",
        "source_url":"https://www.puntoticket.com/evento/A",
        "extracted_at":"2026-09-09T11:00:00Z",
        "name":"Nombre antiguo",
        "status":"sold_out",
        "artists":[{"name":"Artista antiguo","normalized_name":"artista antiguo","position":0}],
        "venue":{"name":"Recinto antiguo","normalized_name":"recinto antiguo","city":"Valparaiso"},
        "performances":[{"starts_at":"2026-12-20T23:00:00Z","timezone":"America/Santiago","status":"sold_out"}]
      }$event$::jsonb
    )
  $sql$,
  'an older observation can be replayed safely'
);
select is((select name from public.events where source_url like '%/A'), 'Evento A actualizado', 'an older observation does not overwrite newer data');
select is(
  (select count(*) from public.performances where starts_at = '2026-12-20T23:00:00Z'),
  0::bigint,
  'an older observation does not insert a new performance'
);
select is(
  (select count(*) from public.event_artists where normalized_name = 'artista antiguo'),
  0::bigint,
  'an older observation does not insert a new artist'
);
select is(
  (select name || '|' || city from public.event_venues where event_id = (select id from public.events where source_url like '%/A')),
  'Teatro Municipal|Santiago Centro',
  'an older observation does not alter the venue'
);

select lives_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      '{"source":"puntoticket","source_url":"https://www.puntoticket.com/evento/B","source_code":"SHARED","extracted_at":"2026-09-09T13:30:00Z","name":"Evento B","status":"upcoming","artists":[],"performances":[{"starts_at":"2027-01-01T03:00:00Z","timezone":"America/Santiago","status":"upcoming"}]}'::jsonb
    )
  $sql$,
  'a source_code collision retains the second event'
);
select is((select count(*) from public.events where source_code = 'SHARED'), 2::bigint, 'source_code is not an identity');
select is((select count(*) from public.scrape_errors where code = 'duplicate_source_code'), 1::bigint, 'a source_code collision records a warning');

select lives_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      '{"source":"puntoticket","source_url":"https://www.puntoticket.com/evento/A","source_code":"SHARED","extracted_at":"2026-09-09T14:00:00Z","name":"Evento A actualizado","status":"available","artists":[],"performances":[{"starts_at":"2026-12-14T23:00:00Z","timezone":"America/Santiago","status":"available"}]}'::jsonb
    )
  $sql$,
  'a date correction without external identity retains the new date'
);
select is((select count(*) from public.performances where event_id = (select id from public.events where source_url like '%/A')), 3::bigint, 'possible date corrections retain old and new performances');
select is((select count(*) from public.scrape_errors where code = 'possible_performance_date_correction'), 1::bigint, 'a possible date correction records a warning');

select throws_ok(
  $sql$
    select public.persist_normalized_event(
      (select max(id) from public.scrape_runs),
      '{"source":"puntoticket","source_url":"https://www.puntoticket.com/evento/INVALID","extracted_at":"2026-09-09T15:00:00Z","name":"Invalid","status":"available","artists":[],"performances":[{"starts_at":"2026-12-15T23:00:00Z","timezone":"","status":"available"}]}'::jsonb
    )
  $sql$,
  '23514',
  null,
  'a failing child row aborts the event RPC'
);
select is((select count(*) from public.events where source_url like '%/INVALID'), 0::bigint, 'a failed event RPC rolls back the parent event');

select lives_ok(
  $sql$
    select public.record_scrape_error(
      (select max(id) from public.scrape_runs),
      '{"source_url":"https://www.puntoticket.com/evento/A","stage":"persist","severity":"error","code":"test_error","message":"apikey=sb_secret_SHOULD_NOT_SURVIVE","attempts":1}'::jsonb
    )
  $sql$,
  'scrape errors can be recorded separately'
);
select is((select message from public.scrape_errors where code = 'test_error'), 'apikey=[REDACTED]', 'stored error messages are sanitized');

select lives_ok(
  $sql$
    select public.record_scrape_error(
      (select max(id) from public.scrape_runs),
      $error${"stage":"persist","severity":"error","code":"header_error","message":"request failed\nAuthorization: Bearer eyJhbGciOiJIUzI1NiJ9.REAL\nCookie: session=SECRET; refresh=MORE\nstatus=401","attempts":1}$error$::jsonb
    )
  $sql$,
  'scrape error headers with bearer and multiple cookies can be recorded'
);
select is(
  (select message from public.scrape_errors where code = 'header_error'),
  'request failed Authorization=[REDACTED] Cookie=[REDACTED] status=401',
  'stored header values are fully sanitized without discarding surrounding context'
);

select lives_ok(
  $sql$
    select public.record_scrape_error(
      (select max(id) from public.scrape_runs),
      jsonb_build_object(
        'stage', 'persist',
        'severity', 'error',
        'code', 'json_secret_error',
        'message', '{"Authorization":"Bearer JWT","Proxy-Authorization":"Basic BASIC_JSON","Cookie":"session=COOKIE_JSON; refresh=MORE","api-key":"API_JSON","access_token":"TOKEN_JSON","refresh_token":"REFRESH_JSON","token":"DIRECT_TOKEN_JSON","Set-Cookie":"session=SET_COOKIE_JSON; HttpOnly","status":401}',
        'attempts', 1
      )
    )
  $sql$,
  'stringified JSON errors with sensitive keys can be recorded'
);
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%JWT%', 'JWT does not survive SQL sanitization');
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%BASIC_JSON%', 'BASIC_JSON does not survive SQL sanitization');
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%COOKIE_JSON%', 'COOKIE_JSON does not survive SQL sanitization');
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%MORE%', 'MORE does not survive SQL sanitization');
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%API_JSON%', 'API_JSON does not survive SQL sanitization');
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%TOKEN_JSON%', 'TOKEN_JSON does not survive SQL sanitization');
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%REFRESH_JSON%', 'REFRESH_JSON does not survive SQL sanitization');
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%DIRECT_TOKEN_JSON%', 'DIRECT_TOKEN_JSON does not survive SQL sanitization');
select unlike((select message from public.scrape_errors where code = 'json_secret_error'), '%SET_COOKIE_JSON%', 'SET_COOKIE_JSON does not survive SQL sanitization');
select is(
  (select message from public.scrape_errors where code = 'json_secret_error'),
  '{"Authorization":"[REDACTED]","Proxy-Authorization":"[REDACTED]","Cookie":"[REDACTED]","api-key":"[REDACTED]","access_token":"[REDACTED]","refresh_token":"[REDACTED]","token":"[REDACTED]","Set-Cookie":"[REDACTED]","status":401}',
  'SQL sanitization preserves a reasonable stringified JSON shape and non-sensitive fields'
);
select lives_ok(
  $sql$
    select public.record_scrape_error(
      (select max(id) from public.scrape_runs),
      jsonb_build_object(
        'stage', 'persist',
        'severity', 'error',
        'code', 'json_secret_error_replayed',
        'message', (select message from public.scrape_errors where code = 'json_secret_error'),
        'attempts', 1
      )
    )
  $sql$,
  'an already sanitized stringified JSON error can be recorded again'
);
select is(
  (select message from public.scrape_errors where code = 'json_secret_error_replayed'),
  (select message from public.scrape_errors where code = 'json_secret_error'),
  'SQL sanitization is idempotent'
);

select lives_ok(
  $sql$
    select public.finish_scrape_run(
      (select max(id) from public.scrape_runs),
      '{"finished_at":"2026-09-09T15:05:00Z","status":"partial","discovered_count":3,"attempted_count":3,"succeeded_count":2,"failed_count":1,"warnings_count":2,"snapshot_complete":false}'::jsonb
    )
  $sql$,
  'a run is finalized separately'
);
select is((select status from public.scrape_runs order by id desc limit 1), 'partial', 'the final run status is stored');

reset role;

select throws_ok(
  $$
    insert into public.performances (
      event_id, starts_at, timezone, status, source_extracted_at, first_seen_at, last_seen_at
    ) values (
      999999999, '2027-01-01T00:00:00Z', 'America/Santiago', 'available', now(), now(), now()
    )
  $$,
  '23503',
  null,
  'foreign keys reject orphan performances'
);

select * from finish();
rollback;
