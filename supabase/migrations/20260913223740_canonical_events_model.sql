-- Brief 003 — Modelo canónico de eventos (reescritura del esquema de catálogo).
--
-- Decisiones: D1=b (reescritura), D2=a (events canónico + event_sources),
-- D3=a (matching conservador + needs_review), D4=b (catalog_events_v2; v1 se
-- retira, el frontend queda no funcional hasta su brief), D5=a (artist/venue
-- por normalized_name + slug). Migración destructiva: el catálogo se repuebla
-- con el cron; `sources`, `scrape_runs`, `scrape_errors` se conservan.
--
-- Un mismo concierto observado en varias fuentes se asocia a UN evento canónico
-- mediante una clave de match conservadora (venue normalizado + nombre
-- normalizado del evento). Sin match seguro, se crea un canónico nuevo.

-- 1) DROP del catálogo viejo (orden de FKs). sources/scrape_runs/scrape_errors se conservan.
drop view if exists public.catalog_events_v1;
drop function if exists public.persist_normalized_event(bigint, jsonb);
drop table if exists public.event_artists;
drop table if exists public.event_venues;
drop table if exists public.performances;
drop table if exists public.events;

-- 2) Entidades canónicas -----------------------------------------------------

create table public.artists (
  id bigint generated always as identity primary key,
  slug text not null,
  normalized_name text not null,
  name text not null,
  description text,
  city text,
  country text,
  genre text,
  image_url text,
  links jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artists_slug_key unique (slug),
  constraint artists_normalized_name_key unique (normalized_name),
  constraint artists_slug_not_blank check (btrim(slug) <> ''),
  constraint artists_normalized_name_not_blank check (btrim(normalized_name) <> ''),
  constraint artists_name_not_blank check (btrim(name) <> ''),
  constraint artists_image_url_https check (image_url is null or image_url ~ '^https://[^[:space:]]+$'),
  constraint artists_links_object check (jsonb_typeof(links) = 'object')
);

create table public.venues (
  id bigint generated always as identity primary key,
  slug text not null,
  normalized_name text not null,
  name text not null,
  address text,
  city text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  capacity integer,
  links jsonb not null default '{}'::jsonb,
  image_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_slug_key unique (slug),
  constraint venues_normalized_name_key unique (normalized_name),
  constraint venues_slug_not_blank check (btrim(slug) <> ''),
  constraint venues_normalized_name_not_blank check (btrim(normalized_name) <> ''),
  constraint venues_name_not_blank check (btrim(name) <> ''),
  constraint venues_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint venues_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint venues_capacity_nonnegative check (capacity is null or capacity >= 0),
  constraint venues_image_url_https check (image_url is null or image_url ~ '^https://[^[:space:]]+$'),
  constraint venues_links_object check (jsonb_typeof(links) = 'object')
);

-- Evento canónico: independiente de la fuente.
create table public.events (
  id bigint generated always as identity primary key,
  slug text not null,
  match_key text not null,
  name text not null,
  category text not null default 'musica',
  subcategory text,
  description text,
  venue_id bigint references public.venues(id) on delete set null,
  status text not null default 'unknown',
  image_url text,
  needs_review boolean not null default false,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_slug_key unique (slug),
  constraint events_match_key_key unique (match_key),
  constraint events_slug_not_blank check (btrim(slug) <> ''),
  constraint events_match_key_not_blank check (btrim(match_key) <> ''),
  constraint events_name_not_blank check (btrim(name) <> ''),
  constraint events_category_not_blank check (btrim(category) <> ''),
  constraint events_status_check check (status in ('available', 'sold_out', 'upcoming', 'unknown')),
  constraint events_image_url_https check (image_url is null or image_url ~ '^https://[^[:space:]]+$'),
  constraint events_seen_range check (first_seen_at <= last_seen_at)
);

-- Observación de un evento canónico en una fuente concreta.
create table public.event_sources (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  source_id bigint not null references public.sources(id) on delete restrict,
  source_url text not null,
  source_code text,
  purchase_url text,
  status text not null default 'unknown',
  price_min numeric(14, 2),
  price_max numeric(14, 2),
  currency text,
  image_url text,
  source_extracted_at timestamptz not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sources_source_url_key unique (source_id, source_url),
  constraint event_sources_source_url_https check (source_url ~ '^https://[^[:space:]]+$'),
  constraint event_sources_purchase_url_https check (purchase_url is null or purchase_url ~ '^https://[^[:space:]]+$'),
  constraint event_sources_image_url_https check (image_url is null or image_url ~ '^https://[^[:space:]]+$'),
  constraint event_sources_status_check check (status in ('available', 'sold_out', 'upcoming', 'unknown')),
  constraint event_sources_prices_nonnegative check ((price_min is null or price_min >= 0) and (price_max is null or price_max >= 0)),
  constraint event_sources_price_range check (price_min is null or price_max is null or price_min <= price_max),
  constraint event_sources_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint event_sources_seen_range check (first_seen_at <= last_seen_at)
);

-- N:M evento canónico <-> artista.
create table public.event_artists (
  event_id bigint not null references public.events(id) on delete cascade,
  artist_id bigint not null references public.artists(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, artist_id),
  constraint event_artists_position_nonnegative check (position >= 0)
);

-- Funciones del evento canónico.
create table public.performances (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  timezone text not null,
  status text not null default 'unknown',
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

-- 3) Índices -----------------------------------------------------------------
create index events_status_id_idx on public.events (status, id);
create index events_venue_idx on public.events (venue_id) where venue_id is not null;
create index events_needs_review_idx on public.events (needs_review) where needs_review;
create index event_sources_event_idx on public.event_sources (event_id);
create index event_sources_source_idx on public.event_sources (source_id, source_code) where source_code is not null;
create index event_artists_artist_idx on public.event_artists (artist_id);
create index performances_starts_event_idx on public.performances (starts_at, event_id);

-- 4) RLS y grants (lectura pública del catálogo; escritura solo service_role) -
alter table public.artists enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_sources enable row level security;
alter table public.event_artists enable row level security;
alter table public.performances enable row level security;

revoke all on table public.artists, public.venues, public.events, public.event_sources, public.event_artists, public.performances from anon, authenticated;
grant select on table public.artists, public.venues, public.events, public.event_sources, public.event_artists, public.performances to anon, authenticated;
grant select, insert, update on table public.artists, public.venues, public.events, public.event_sources, public.event_artists, public.performances to service_role;
grant usage on sequence public.artists_id_seq, public.venues_id_seq, public.events_id_seq, public.event_sources_id_seq, public.performances_id_seq to service_role;

create policy artists_catalog_read on public.artists for select to anon, authenticated using (true);
create policy venues_catalog_read on public.venues for select to anon, authenticated using (true);
create policy events_catalog_read on public.events for select to anon, authenticated using (true);
create policy event_sources_catalog_read on public.event_sources for select to anon, authenticated using (true);
create policy event_artists_catalog_read on public.event_artists for select to anon, authenticated using (true);
create policy performances_catalog_read on public.performances for select to anon, authenticated using (true);

-- 5) Helpers de normalización / slug -----------------------------------------

-- unaccent sin depender de la extensión: translate del set común en español.
create or replace function public.unaccent_simple(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    p_text,
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  );
$$;

-- Slug determinista desde un texto: minúsculas sin acentos, no-alfanumérico a '-'.
create or replace function public.mishow_slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    lower(public.unaccent_simple(coalesce(p_text, ''))),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- Asegura unicidad de slug agregando sufijo incremental si ya existe.
create or replace function public.mishow_unique_slug(p_base text, p_table regclass)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := nullif(public.mishow_slugify(p_base), '');
  v_candidate text;
  v_exists boolean;
  v_n integer := 1;
begin
  if v_base is null then v_base := 'item'; end if;
  v_candidate := v_base;
  loop
    execute format('select exists(select 1 from %s where slug = $1)', p_table)
      into v_exists using v_candidate;
    exit when not v_exists;
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  end loop;
  return v_candidate;
end;
$$;

-- 6) RPC de persistencia canónica --------------------------------------------
-- Reescribe persist_normalized_event. El payload por-evento del scraper NO
-- cambia; esta función lo distribuye en el modelo canónico:
--   * resuelve/crea artists (por normalized_name) y venue (por normalized_name);
--   * resuelve/crea el evento canónico por match_key conservador
--     (venue normalizado + nombre normalizado del evento);
--   * upsert de event_sources por (source_id, source_url);
--   * upsert de performances del canónico;
--   * vincula artists (N:M) y venue.
create function public.persist_normalized_event(p_run_id bigint, p_event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_id bigint;
  v_event_id bigint;
  v_venue_id bigint;
  v_artist_id bigint;
  v_extracted_at timestamptz;
  v_norm_name text;
  v_venue jsonb;
  v_venue_norm text;
  v_match_key text;
  v_performance jsonb;
  v_artist jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_status text;
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
  v_norm_name := nullif(btrim(lower(public.unaccent_simple(p_event->>'name'))), '');
  if v_norm_name is null then v_norm_name := 'evento sin nombre'; end if;
  v_status := coalesce(nullif(btrim(p_event->>'status'), ''), 'unknown');

  -- Venue (opcional): resolver/crear por normalized_name.
  v_venue := p_event->'venue';
  v_venue_id := null;
  v_venue_norm := null;
  if v_venue is not null and jsonb_typeof(v_venue) = 'object'
     and nullif(btrim(v_venue->>'name'), '') is not null then
    v_venue_norm := nullif(btrim(coalesce(v_venue->>'normalized_name', lower(public.unaccent_simple(v_venue->>'name')))), '');
    if v_venue_norm is not null then
      -- Lock por venue para evitar carreras al crear.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('venue:' || v_venue_norm, 0));
      select id into v_venue_id from public.venues where normalized_name = v_venue_norm;
      if v_venue_id is null then
        insert into public.venues (slug, normalized_name, name, address, city, latitude, longitude)
        values (
          public.mishow_unique_slug(v_venue->>'name', 'public.venues'::regclass),
          v_venue_norm,
          btrim(v_venue->>'name'),
          nullif(btrim(v_venue->>'address'), ''),
          nullif(btrim(v_venue->>'city'), ''),
          (v_venue->>'latitude')::numeric,
          (v_venue->>'longitude')::numeric
        ) returning id into v_venue_id;
      else
        update public.venues set
          address = coalesce(nullif(btrim(v_venue->>'address'), ''), address),
          city = coalesce(nullif(btrim(v_venue->>'city'), ''), city),
          latitude = coalesce((v_venue->>'latitude')::numeric, latitude),
          longitude = coalesce((v_venue->>'longitude')::numeric, longitude),
          last_seen_at = now(), updated_at = now()
        where id = v_venue_id;
      end if;
    end if;
  end if;

  -- Clave de match conservadora: venue normalizado (o '-') + nombre normalizado.
  -- Solo une fuentes cuando coinciden AMBOS; nunca por nombre solo.
  v_match_key := coalesce(v_venue_norm, '-') || '|' || v_norm_name;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('event:' || v_match_key, 0));

  select id into v_event_id from public.events where match_key = v_match_key;
  if v_event_id is null then
    insert into public.events (slug, match_key, name, venue_id, status, image_url, first_seen_at, last_seen_at)
    values (
      public.mishow_unique_slug(p_event->>'name', 'public.events'::regclass),
      v_match_key,
      coalesce(nullif(btrim(p_event->>'name'), ''), 'Evento sin nombre'),
      v_venue_id,
      v_status,
      nullif(btrim(p_event->>'image_url'), ''),
      v_extracted_at, v_extracted_at
    ) returning id into v_event_id;
  else
    update public.events set
      venue_id = coalesce(venue_id, v_venue_id),
      image_url = coalesce(image_url, nullif(btrim(p_event->>'image_url'), '')),
      -- El estado canónico toma la señal más informativa disponible.
      status = case when v_status <> 'unknown' then v_status else status end,
      last_seen_at = greatest(last_seen_at, v_extracted_at),
      updated_at = now()
    where id = v_event_id;
  end if;

  -- Observación por fuente.
  insert into public.event_sources as es (
    event_id, source_id, source_url, source_code, purchase_url, status,
    price_min, price_max, currency, image_url, source_extracted_at, first_seen_at, last_seen_at
  ) values (
    v_event_id, v_source_id, p_event->>'source_url',
    nullif(btrim(p_event->>'source_code'), ''),
    nullif(btrim(p_event->>'purchase_url'), ''),
    v_status,
    (p_event->'price'->>'min')::numeric,
    (p_event->'price'->>'max')::numeric,
    nullif(btrim(p_event->'price'->>'currency'), ''),
    nullif(btrim(p_event->>'image_url'), ''),
    v_extracted_at, v_extracted_at, v_extracted_at
  )
  on conflict (source_id, source_url) do update set
    source_code = coalesce(nullif(btrim(excluded.source_code), ''), es.source_code),
    purchase_url = coalesce(nullif(btrim(excluded.purchase_url), ''), es.purchase_url),
    status = excluded.status,
    price_min = coalesce(excluded.price_min, es.price_min),
    price_max = coalesce(excluded.price_max, es.price_max),
    currency = coalesce(excluded.currency, es.currency),
    image_url = coalesce(nullif(btrim(excluded.image_url), ''), es.image_url),
    source_extracted_at = excluded.source_extracted_at,
    first_seen_at = least(es.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(es.last_seen_at, excluded.last_seen_at),
    updated_at = now()
  where excluded.source_extracted_at >= es.source_extracted_at;

  -- Artistas (N:M): resolver/crear por normalized_name y vincular.
  for v_artist in
    select item.value from jsonb_array_elements(coalesce(p_event->'artists', '[]'::jsonb)) as item(value)
    order by (item.value->>'position')::integer nulls last, item.value->>'normalized_name'
  loop
    if nullif(btrim(v_artist->>'normalized_name'), '') is null then continue; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('artist:' || (v_artist->>'normalized_name'), 0));
    select id into v_artist_id from public.artists where normalized_name = v_artist->>'normalized_name';
    if v_artist_id is null then
      insert into public.artists (slug, normalized_name, name)
      values (
        public.mishow_unique_slug(v_artist->>'name', 'public.artists'::regclass),
        v_artist->>'normalized_name',
        coalesce(nullif(btrim(v_artist->>'name'), ''), v_artist->>'normalized_name')
      ) returning id into v_artist_id;
    else
      update public.artists set last_seen_at = now(), updated_at = now() where id = v_artist_id;
    end if;
    insert into public.event_artists (event_id, artist_id, position)
    values (v_event_id, v_artist_id, coalesce((v_artist->>'position')::integer, 0))
    on conflict (event_id, artist_id) do update set position = excluded.position, updated_at = now();
  end loop;

  -- Funciones del canónico.
  for v_performance in
    select item.value from jsonb_array_elements(coalesce(p_event->'performances', '[]'::jsonb)) as item(value)
    order by (item.value->>'starts_at')::timestamptz, coalesce(item.value->>'performance_code', '')
  loop
    insert into public.performances as pf (
      event_id, starts_at, timezone, status, performance_code, purchase_url,
      source_extracted_at, first_seen_at, last_seen_at
    ) values (
      v_event_id,
      (v_performance->>'starts_at')::timestamptz,
      v_performance->>'timezone',
      coalesce(nullif(btrim(v_performance->>'status'), ''), 'unknown'),
      nullif(btrim(v_performance->>'performance_code'), ''),
      nullif(btrim(v_performance->>'purchase_url'), ''),
      v_extracted_at, v_extracted_at, v_extracted_at
    )
    on conflict (event_id, starts_at) do update set
      timezone = coalesce(nullif(btrim(excluded.timezone), ''), pf.timezone),
      status = case when excluded.status = 'unknown' and pf.status <> 'unknown' then pf.status else excluded.status end,
      performance_code = coalesce(nullif(btrim(excluded.performance_code), ''), pf.performance_code),
      purchase_url = coalesce(nullif(btrim(excluded.purchase_url), ''), pf.purchase_url),
      source_extracted_at = excluded.source_extracted_at,
      first_seen_at = least(pf.first_seen_at, excluded.first_seen_at),
      last_seen_at = greatest(pf.last_seen_at, excluded.last_seen_at),
      updated_at = now()
    where excluded.source_extracted_at >= pf.source_extracted_at;
  end loop;

  return jsonb_build_object('event_id', v_event_id::text, 'warnings', v_warnings);
end;
$$;

revoke execute on function public.persist_normalized_event(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.persist_normalized_event(bigint, jsonb) to service_role;

-- 7) Vista pública catalog_events_v2 (evento canónico + fuentes/artists/venue) -
create view public.catalog_events_v2
with (security_invoker = true)
as
select
  event.id,
  event.slug,
  event.name,
  event.category,
  event.subcategory,
  event.status,
  event.image_url,
  event.needs_review,
  event.first_seen_at,
  event.last_seen_at,
  (
    select min(performance.starts_at)
    from public.performances as performance
    where performance.event_id = event.id and performance.starts_at >= now()
  ) as next_performance_at,
  coalesce((
    select jsonb_agg(jsonb_build_object('name', artist.name, 'slug', artist.slug) order by ea.position, artist.normalized_name)
    from public.event_artists as ea
    join public.artists as artist on artist.id = ea.artist_id
    where ea.event_id = event.id
  ), '[]'::jsonb) as artists,
  (
    select jsonb_strip_nulls(jsonb_build_object(
      'slug', venue.slug, 'name', venue.name, 'address', venue.address,
      'city', venue.city, 'latitude', venue.latitude, 'longitude', venue.longitude
    ))
    from public.venues as venue
    where venue.id = event.venue_id
  ) as venue,
  coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'source', src.code,
      'source_url', es.source_url,
      'purchase_url', es.purchase_url,
      'status', es.status,
      'price_min', es.price_min,
      'price_max', es.price_max,
      'currency', es.currency
    )) order by src.code)
    from public.event_sources as es
    join public.sources as src on src.id = es.source_id
    where es.event_id = event.id
  ), '[]'::jsonb) as sources,
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
from public.events as event;

revoke all on table public.catalog_events_v2 from anon, authenticated;
grant select on table public.catalog_events_v2 to anon, authenticated, service_role;
