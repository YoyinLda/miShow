create table public.sources (
  id bigint generated always as identity primary key,
  code text not null,
  name text not null,
  base_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_code_key unique (code),
  constraint sources_code_not_blank check (btrim(code) <> ''),
  constraint sources_name_not_blank check (btrim(name) <> ''),
  constraint sources_base_url_https check (base_url ~ '^https://[^[:space:]]+$')
);

create table public.events (
  id bigint generated always as identity primary key,
  source_id bigint not null references public.sources(id) on delete restrict,
  source_url text not null,
  source_code text,
  purchase_url text,
  image_url text,
  name text not null,
  status text not null,
  price_min numeric(14, 2),
  price_max numeric(14, 2),
  currency text,
  source_extracted_at timestamptz not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_source_url_key unique (source_id, source_url),
  constraint events_source_url_https check (source_url ~ '^https://[^[:space:]]+$'),
  constraint events_purchase_url_https check (purchase_url is null or purchase_url ~ '^https://[^[:space:]]+$'),
  constraint events_image_url_https check (image_url is null or image_url ~ '^https://[^[:space:]]+$'),
  constraint events_name_not_blank check (btrim(name) <> ''),
  constraint events_status_check check (status in ('available', 'sold_out', 'upcoming', 'unknown')),
  constraint events_prices_nonnegative check ((price_min is null or price_min >= 0) and (price_max is null or price_max >= 0)),
  constraint events_price_range check (price_min is null or price_max is null or price_min <= price_max),
  constraint events_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint events_seen_range check (first_seen_at <= last_seen_at)
);

create table public.performances (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  timezone text not null,
  status text not null,
  performance_code text,
  purchase_url text,
  source_extracted_at timestamptz not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performances_event_starts_key unique (event_id, starts_at),
  constraint performances_timezone_not_blank check (btrim(timezone) <> ''),
  constraint performances_status_check check (status in ('available', 'sold_out', 'upcoming', 'unknown')),
  constraint performances_purchase_url_https check (purchase_url is null or purchase_url ~ '^https://[^[:space:]]+$'),
  constraint performances_seen_range check (first_seen_at <= last_seen_at)
);

create table public.event_artists (
  event_id bigint not null references public.events(id) on delete cascade,
  normalized_name text not null,
  name text not null,
  position integer not null,
  source_extracted_at timestamptz not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, normalized_name),
  constraint event_artists_normalized_name_not_blank check (btrim(normalized_name) <> ''),
  constraint event_artists_name_not_blank check (btrim(name) <> ''),
  constraint event_artists_position_nonnegative check (position >= 0),
  constraint event_artists_seen_range check (first_seen_at <= last_seen_at)
);

create table public.event_venues (
  event_id bigint primary key references public.events(id) on delete cascade,
  normalized_name text,
  name text,
  address text,
  city text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  source_extracted_at timestamptz not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_venues_has_data check (
    coalesce(nullif(btrim(name), ''), nullif(btrim(address), ''), nullif(btrim(city), '')) is not null
    or latitude is not null
    or longitude is not null
  ),
  constraint event_venues_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint event_venues_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint event_venues_seen_range check (first_seen_at <= last_seen_at)
);

create table public.scrape_runs (
  id bigint generated always as identity primary key,
  source_id bigint not null references public.sources(id) on delete restrict,
  listing_url text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,
  discovered_count integer not null default 0,
  attempted_count integer not null default 0,
  succeeded_count integer not null default 0,
  failed_count integer not null default 0,
  warnings_count integer not null default 0,
  snapshot_complete boolean not null default false,
  parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scrape_runs_listing_url_https check (listing_url ~ '^https://[^[:space:]]+$'),
  constraint scrape_runs_status_check check (status in ('running', 'succeeded', 'partial', 'failed')),
  constraint scrape_runs_counts_nonnegative check (
    discovered_count >= 0 and attempted_count >= 0 and succeeded_count >= 0 and failed_count >= 0 and warnings_count >= 0
  ),
  constraint scrape_runs_count_consistency check (attempted_count <= discovered_count and succeeded_count + failed_count <= attempted_count),
  constraint scrape_runs_parameters_object check (jsonb_typeof(parameters) = 'object'),
  constraint scrape_runs_status_consistency check (
    (status = 'running')
    or (status = 'succeeded' and failed_count = 0 and warnings_count = 0)
    or (status = 'partial' and succeeded_count > 0 and (failed_count > 0 or warnings_count > 0))
    or (status = 'failed' and succeeded_count = 0)
  ),
  constraint scrape_runs_time_status_check check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null and finished_at >= started_at)
  )
);

create table public.scrape_errors (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.scrape_runs(id) on delete cascade,
  source_url text,
  stage text not null,
  severity text not null,
  code text not null,
  message text not null,
  attempts integer not null,
  created_at timestamptz not null default now(),
  constraint scrape_errors_source_url_https check (source_url is null or source_url ~ '^https://[^[:space:]]+$'),
  constraint scrape_errors_stage_not_blank check (btrim(stage) <> ''),
  constraint scrape_errors_severity_check check (severity in ('warning', 'error')),
  constraint scrape_errors_code_not_blank check (btrim(code) <> ''),
  constraint scrape_errors_message_length check (char_length(message) between 1 and 2000),
  constraint scrape_errors_attempts_positive check (attempts >= 1)
);

create index events_status_id_idx on public.events (status, id);
create index events_source_code_idx on public.events (source_id, source_code) where source_code is not null;
create index performances_starts_event_idx on public.performances (starts_at, event_id);
create index scrape_runs_source_started_idx on public.scrape_runs (source_id, started_at desc);
create index scrape_errors_run_created_idx on public.scrape_errors (run_id, created_at);

alter table public.sources enable row level security;
alter table public.events enable row level security;
alter table public.performances enable row level security;
alter table public.event_artists enable row level security;
alter table public.event_venues enable row level security;
alter table public.scrape_runs enable row level security;
alter table public.scrape_errors enable row level security;

revoke all on table public.sources, public.events, public.performances, public.event_artists, public.event_venues, public.scrape_runs, public.scrape_errors from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.sources, public.events, public.performances, public.event_artists, public.event_venues to anon, authenticated;

grant select, insert, update on table public.sources, public.events, public.performances, public.event_artists, public.event_venues, public.scrape_runs to service_role;
grant select, insert on table public.scrape_errors to service_role;
grant usage on sequence public.sources_id_seq, public.events_id_seq, public.performances_id_seq, public.scrape_runs_id_seq, public.scrape_errors_id_seq to service_role;

create policy sources_catalog_read on public.sources for select to anon, authenticated using (true);
create policy events_catalog_read on public.events for select to anon, authenticated using (true);
create policy performances_catalog_read on public.performances for select to anon, authenticated using (true);
create policy event_artists_catalog_read on public.event_artists for select to anon, authenticated using (true);
create policy event_venues_catalog_read on public.event_venues for select to anon, authenticated using (true);

create view public.catalog_events_v1
with (security_invoker = true)
as
select
  event.id,
  source.code as source,
  event.source_url,
  event.source_code,
  event.purchase_url,
  event.image_url,
  event.name,
  event.status,
  event.price_min,
  event.price_max,
  event.currency,
  event.source_extracted_at,
  event.first_seen_at,
  event.last_seen_at,
  (
    select min(performance.starts_at)
    from public.performances as performance
    where performance.event_id = event.id and performance.starts_at >= now()
  ) as next_performance_at,
  coalesce((
    select jsonb_agg(jsonb_build_object('name', artist.name) order by artist.position, artist.normalized_name)
    from public.event_artists as artist
    where artist.event_id = event.id
  ), '[]'::jsonb) as artists,
  (
    select jsonb_strip_nulls(jsonb_build_object(
      'name', venue.name,
      'address', venue.address,
      'city', venue.city,
      'latitude', venue.latitude,
      'longitude', venue.longitude
    ))
    from public.event_venues as venue
    where venue.event_id = event.id
  ) as venue,
  coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'starts_at', performance.starts_at,
      'timezone', performance.timezone,
      'status', performance.status,
      'performance_code', performance.performance_code,
      'purchase_url', performance.purchase_url
    )) order by performance.starts_at)
    from public.performances as performance
    where performance.event_id = event.id
  ), '[]'::jsonb) as performances
from public.events as event
join public.sources as source on source.id = event.source_id;

revoke all on table public.catalog_events_v1 from anon, authenticated;
grant select on table public.catalog_events_v1 to anon, authenticated, service_role;

create function public.start_scrape_run(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_id bigint;
  v_run_id bigint;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception using errcode = '22023', message = 'start run input must be an object';
  end if;
  if nullif(btrim(p_input->>'source'), '') is null or nullif(btrim(p_input->>'listing_url'), '') is null then
    raise exception using errcode = '22023', message = 'source and listing_url are required';
  end if;

  insert into public.sources as current (code, name, base_url)
  values (p_input->>'source', 'PuntoTicket', 'https://www.puntoticket.com')
  on conflict (code) do update
  set name = excluded.name,
      base_url = excluded.base_url,
      updated_at = now()
  returning current.id into v_source_id;

  insert into public.scrape_runs (
    source_id, listing_url, started_at, status, parameters, snapshot_complete
  ) values (
    v_source_id,
    p_input->>'listing_url',
    (p_input->>'started_at')::timestamptz,
    'running',
    coalesce(p_input->'parameters', '{}'::jsonb),
    false
  ) returning id into v_run_id;

  return jsonb_build_object('run_id', v_run_id::text, 'status', 'running');
end;
$$;

create function public.record_scrape_error(p_run_id bigint, p_error jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_error_id bigint;
  v_message text;
begin
  if not exists (select 1 from public.scrape_runs where id = p_run_id and status = 'running') then
    raise exception using errcode = '22023', message = 'run does not exist or is not running';
  end if;
  v_message := regexp_replace(coalesce(p_error->>'message', 'Persistence error'), '(https?://)[^/@[:space:]?#]+@', '\1[REDACTED]@', 'gi');
  v_message := regexp_replace(
    v_message,
    $regex$(^|[[:space:]{,;])("(?:authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|(?:[[:alnum:]]+[-_])*token)"|'(?:authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|(?:[[:alnum:]]+[-_])*token)'|(?:authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|(?:[[:alnum:]]+[-_])*token))([[:blank:]]*[:=][[:blank:]]*)"[^"]*"$regex$,
    $replacement$\1\2\3"[REDACTED]"$replacement$,
    'gi'
  );
  v_message := regexp_replace(
    v_message,
    $regex$(^|[[:space:]{,;])("(?:authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|(?:[[:alnum:]]+[-_])*token)"|'(?:authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|(?:[[:alnum:]]+[-_])*token)'|(?:authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|(?:[[:alnum:]]+[-_])*token))([[:blank:]]*[:=][[:blank:]]*)'[^']*'$regex$,
    $replacement$\1\2\3'[REDACTED]'$replacement$,
    'gi'
  );
  v_message := regexp_replace(v_message, $regex$^([[:blank:]]*)(authorization|proxy-authorization|cookie|set-cookie)[[:blank:]]*[:=](?![[:blank:]]*["'])[[:blank:]]*[^\r\n]*$regex$, '\1\2=[REDACTED]', 'gin');
  v_message := regexp_replace(
    v_message,
    $regex$(^|[[:space:]{,;])("(?:authorization|proxy-authorization)"|'(?:authorization|proxy-authorization)'|(?:authorization|proxy-authorization))([[:blank:]]*[:=](?![[:blank:]]*["'])[[:blank:]]*)(?:(?:bearer|basic)[[:blank:]]+)?[^[:space:],;}]+$regex$,
    '\1\2\3[REDACTED]',
    'gi'
  );
  v_message := regexp_replace(
    v_message,
    $regex$(^|[[:space:]{,;])("(?:cookie|set-cookie)"|'(?:cookie|set-cookie)'|(?:cookie|set-cookie))([[:blank:]]*[:=](?![[:blank:]]*["'])[[:blank:]]*)[^\r\n,}]+$regex$,
    '\1\2\3[REDACTED]',
    'gi'
  );
  v_message := regexp_replace(
    v_message,
    $regex$(^|[[:space:]{,;])("(?:api[-_]?key|(?:[[:alnum:]]+[-_])*token)"|'(?:api[-_]?key|(?:[[:alnum:]]+[-_])*token)'|(?:api[-_]?key|(?:[[:alnum:]]+[-_])*token))([[:blank:]]*[:=](?![[:blank:]]*["'])[[:blank:]]*)(?:bearer[[:blank:]]+)?[^[:space:],;}]+$regex$,
    '\1\2\3[REDACTED]',
    'gi'
  );
  v_message := regexp_replace(v_message, 'bearer[[:blank:]]+[A-Za-z0-9._~+/=-]+', 'Bearer [REDACTED]', 'gi');
  v_message := regexp_replace(v_message, '(bearer[[:space:]]+)?sb_secret_[A-Za-z0-9._-]+', '[REDACTED]', 'gi');
  v_message := left(regexp_replace(v_message, '[[:space:]]+', ' ', 'g'), 2000);
  insert into public.scrape_errors (run_id, source_url, stage, severity, code, message, attempts)
  values (
    p_run_id,
    nullif(btrim(p_error->>'source_url'), ''),
    p_error->>'stage',
    p_error->>'severity',
    p_error->>'code',
    v_message,
    greatest(coalesce((p_error->>'attempts')::integer, 1), 1)
  ) returning id into v_error_id;
  return jsonb_build_object('error_id', v_error_id::text);
end;
$$;

create function public.persist_normalized_event(p_run_id bigint, p_event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_id bigint;
  v_event_id bigint;
  v_extracted_at timestamptz;
  v_source_code text;
  v_event_current boolean := false;
  v_performance jsonb;
  v_artist jsonb;
  v_venue jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  select run.source_id into v_source_id
  from public.scrape_runs as run
  join public.sources as source on source.id = run.source_id
  where run.id = p_run_id and run.status = 'running' and source.code = p_event->>'source';
  if v_source_id is null then
    raise exception using errcode = '22023', message = 'run does not match event source or is not running';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' or nullif(btrim(p_event->>'source_url'), '') is null then
    raise exception using errcode = '22023', message = 'normalized event is invalid';
  end if;
  v_extracted_at := (p_event->>'extracted_at')::timestamptz;
  v_source_code := nullif(btrim(p_event->>'source_code'), '');

  if v_source_code is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_source_id::text || ':' || v_source_code, 0)
    );
  end if;

  insert into public.events as current (
    source_id, source_url, source_code, purchase_url, image_url, name, status,
    price_min, price_max, currency, source_extracted_at, first_seen_at, last_seen_at
  ) values (
    v_source_id,
    p_event->>'source_url',
    v_source_code,
    nullif(btrim(p_event->>'purchase_url'), ''),
    nullif(btrim(p_event->>'image_url'), ''),
    coalesce(nullif(btrim(p_event->>'name'), ''), 'Evento sin nombre'),
    coalesce(nullif(btrim(p_event->>'status'), ''), 'unknown'),
    (p_event->'price'->>'min')::numeric,
    (p_event->'price'->>'max')::numeric,
    nullif(btrim(p_event->'price'->>'currency'), ''),
    v_extracted_at,
    v_extracted_at,
    v_extracted_at
  )
  on conflict (source_id, source_url) do update
  set source_code = coalesce(nullif(btrim(excluded.source_code), ''), current.source_code),
      purchase_url = coalesce(nullif(btrim(excluded.purchase_url), ''), current.purchase_url),
      image_url = coalesce(nullif(btrim(excluded.image_url), ''), current.image_url),
      name = case
        when nullif(btrim(excluded.name), '') is null then current.name
        when excluded.name = 'Evento sin nombre' and current.name <> 'Evento sin nombre' then current.name
        else excluded.name
      end,
      status = case when excluded.status = 'unknown' and current.status <> 'unknown' then current.status else excluded.status end,
      price_min = case
        when coalesce(excluded.price_min, current.price_min) is not null
          and coalesce(excluded.price_max, current.price_max) is not null
          and coalesce(excluded.price_min, current.price_min) > coalesce(excluded.price_max, current.price_max)
          then current.price_min
        else coalesce(excluded.price_min, current.price_min)
      end,
      price_max = case
        when coalesce(excluded.price_min, current.price_min) is not null
          and coalesce(excluded.price_max, current.price_max) is not null
          and coalesce(excluded.price_min, current.price_min) > coalesce(excluded.price_max, current.price_max)
          then current.price_max
        else coalesce(excluded.price_max, current.price_max)
      end,
      currency = coalesce(nullif(btrim(excluded.currency), ''), current.currency),
      source_extracted_at = excluded.source_extracted_at,
      first_seen_at = least(current.first_seen_at, excluded.first_seen_at),
      last_seen_at = greatest(current.last_seen_at, excluded.last_seen_at),
      updated_at = now()
  where excluded.source_extracted_at >= current.source_extracted_at
  returning current.id into v_event_id;

  if v_event_id is not null then
    v_event_current := true;
  else
    select id into v_event_id from public.events where source_id = v_source_id and source_url = p_event->>'source_url';
    return jsonb_build_object('event_id', v_event_id::text, 'warnings', v_warnings);
  end if;

  if v_event_current and v_source_code is not null and exists (
    select 1 from public.events
    where source_id = v_source_id
      and source_code = v_source_code
      and source_url <> p_event->>'source_url'
  ) then
    insert into public.scrape_errors (run_id, source_url, stage, severity, code, message, attempts)
    values (p_run_id, p_event->>'source_url', 'persist', 'warning', 'duplicate_source_code', 'source_code is shared by different source URLs; both events were retained', 1);
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'stage', 'persist', 'source_url', p_event->>'source_url', 'severity', 'warning',
      'code', 'duplicate_source_code', 'message', 'source_code is shared by different source URLs; both events were retained', 'attempts', 1
    ));
  end if;

  if v_event_current and jsonb_array_length(coalesce(p_event->'performances', '[]'::jsonb)) > 0
     and exists (
       select 1 from jsonb_array_elements(p_event->'performances') as incoming(value)
       where nullif(btrim(incoming.value->>'performance_code'), '') is null
     )
     and exists (
       select 1 from public.performances as existing
       where existing.event_id = v_event_id
         and existing.performance_code is null
         and not exists (
           select 1 from jsonb_array_elements(p_event->'performances') as incoming(value)
           where (incoming.value->>'starts_at')::timestamptz = existing.starts_at
         )
     ) then
    insert into public.scrape_errors (run_id, source_url, stage, severity, code, message, attempts)
    values (p_run_id, p_event->>'source_url', 'persist', 'warning', 'possible_performance_date_correction', 'a new performance date without reliable external identity was retained alongside prior dates', 1);
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'stage', 'persist', 'source_url', p_event->>'source_url', 'severity', 'warning',
      'code', 'possible_performance_date_correction', 'message', 'a new performance date without reliable external identity was retained alongside prior dates', 'attempts', 1
    ));
  end if;

  for v_performance in
    select item.value
    from jsonb_array_elements(coalesce(p_event->'performances', '[]'::jsonb)) as item(value)
    order by (item.value->>'starts_at')::timestamptz, coalesce(item.value->>'performance_code', '')
  loop
    insert into public.performances as current (
      event_id, starts_at, timezone, status, performance_code, purchase_url,
      source_extracted_at, first_seen_at, last_seen_at
    ) values (
      v_event_id,
      (v_performance->>'starts_at')::timestamptz,
      v_performance->>'timezone',
      coalesce(nullif(btrim(v_performance->>'status'), ''), 'unknown'),
      nullif(btrim(v_performance->>'performance_code'), ''),
      nullif(btrim(v_performance->>'purchase_url'), ''),
      v_extracted_at,
      v_extracted_at,
      v_extracted_at
    )
    on conflict (event_id, starts_at) do update
    set timezone = coalesce(nullif(btrim(excluded.timezone), ''), current.timezone),
        status = case when excluded.status = 'unknown' and current.status <> 'unknown' then current.status else excluded.status end,
        performance_code = coalesce(nullif(btrim(excluded.performance_code), ''), current.performance_code),
        purchase_url = coalesce(nullif(btrim(excluded.purchase_url), ''), current.purchase_url),
        source_extracted_at = excluded.source_extracted_at,
        first_seen_at = least(current.first_seen_at, excluded.first_seen_at),
        last_seen_at = greatest(current.last_seen_at, excluded.last_seen_at),
        updated_at = now()
    where excluded.source_extracted_at >= current.source_extracted_at;
  end loop;

  if v_event_current and jsonb_array_length(coalesce(p_event->'artists', '[]'::jsonb)) > 0 then
    for v_artist in
      select item.value
      from jsonb_array_elements(p_event->'artists') as item(value)
      order by item.value->>'normalized_name'
    loop
      insert into public.event_artists (
        event_id, normalized_name, name, position, source_extracted_at, first_seen_at, last_seen_at
      ) values (
        v_event_id,
        v_artist->>'normalized_name',
        v_artist->>'name',
        (v_artist->>'position')::integer,
        v_extracted_at,
        v_extracted_at,
        v_extracted_at
      )
      on conflict (event_id, normalized_name) do update
      set name = excluded.name,
          position = excluded.position,
          source_extracted_at = excluded.source_extracted_at,
          first_seen_at = least(public.event_artists.first_seen_at, excluded.first_seen_at),
          last_seen_at = greatest(public.event_artists.last_seen_at, excluded.last_seen_at),
          updated_at = now();
    end loop;
  end if;

  v_venue := p_event->'venue';
  if v_event_current and v_venue is not null and jsonb_typeof(v_venue) = 'object' and v_venue <> '{}'::jsonb then
    insert into public.event_venues as current (
      event_id, normalized_name, name, address, city, latitude, longitude,
      source_extracted_at, first_seen_at, last_seen_at
    ) values (
      v_event_id,
      nullif(btrim(v_venue->>'normalized_name'), ''),
      nullif(btrim(v_venue->>'name'), ''),
      nullif(btrim(v_venue->>'address'), ''),
      nullif(btrim(v_venue->>'city'), ''),
      (v_venue->>'latitude')::numeric,
      (v_venue->>'longitude')::numeric,
      v_extracted_at,
      v_extracted_at,
      v_extracted_at
    )
    on conflict (event_id) do update
    set normalized_name = coalesce(nullif(btrim(excluded.normalized_name), ''), current.normalized_name),
        name = coalesce(nullif(btrim(excluded.name), ''), current.name),
        address = coalesce(nullif(btrim(excluded.address), ''), current.address),
        city = coalesce(nullif(btrim(excluded.city), ''), current.city),
        latitude = coalesce(excluded.latitude, current.latitude),
        longitude = coalesce(excluded.longitude, current.longitude),
        source_extracted_at = excluded.source_extracted_at,
        first_seen_at = least(current.first_seen_at, excluded.first_seen_at),
        last_seen_at = greatest(current.last_seen_at, excluded.last_seen_at),
        updated_at = now()
    where excluded.source_extracted_at >= current.source_extracted_at;
  end if;

  return jsonb_build_object('event_id', v_event_id::text, 'warnings', v_warnings);
end;
$$;

create function public.finish_scrape_run(p_run_id bigint, p_result jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text := p_result->>'status';
begin
  if v_status not in ('succeeded', 'partial', 'failed') then
    raise exception using errcode = '22023', message = 'invalid final run status';
  end if;
  update public.scrape_runs
  set finished_at = (p_result->>'finished_at')::timestamptz,
      status = v_status,
      discovered_count = coalesce((p_result->>'discovered_count')::integer, 0),
      attempted_count = coalesce((p_result->>'attempted_count')::integer, 0),
      succeeded_count = coalesce((p_result->>'succeeded_count')::integer, 0),
      failed_count = coalesce((p_result->>'failed_count')::integer, 0),
      warnings_count = coalesce((p_result->>'warnings_count')::integer, 0),
      snapshot_complete = false,
      updated_at = now()
  where id = p_run_id and status = 'running';
  if not found then
    raise exception using errcode = '22023', message = 'run does not exist or is already finished';
  end if;
  return jsonb_build_object('run_id', p_run_id::text, 'status', v_status);
end;
$$;

revoke execute on function public.start_scrape_run(jsonb) from public, anon, authenticated;
revoke execute on function public.persist_normalized_event(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.record_scrape_error(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.finish_scrape_run(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.start_scrape_run(jsonb) to service_role;
grant execute on function public.persist_normalized_event(bigint, jsonb) to service_role;
grant execute on function public.record_scrape_error(bigint, jsonb) to service_role;
grant execute on function public.finish_scrape_run(bigint, jsonb) to service_role;

comment on table public.scrape_runs is 'Operational retention: succeeded 90 days; partial/failed 180 days; running older than 2 hours is abandoned for manual or future management. No automatic deletion is configured.';
