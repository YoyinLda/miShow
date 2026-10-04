-- Brief 005 — Etapa 1: hora desconocida.
--
-- Agrega `performances.time_known` para distinguir una hora real de una hora
-- desconocida (fecha-only). Decisión TL/PO: sin backfill; el default `true`
-- preserva las filas existentes como "hora conocida" y la verdad nueva
-- (`time_known=false`) llega con la próxima corrida del scraper. La migración es
-- idempotente (add column if not exists, create or replace) y reversible
-- recreando los objetos previos (ver reverso al final).
--
-- NO aplicar automáticamente: requiere `supabase db push` del TL/PO.

-- 1) Columna time_known (default true, sin backfill).
alter table public.performances
  add column if not exists time_known boolean not null default true;

-- 2) Vista catalog_events_v2: expone time_known por función y
--    next_performance_time_known a nivel evento (hermano de next_performance_at).
--    Se usa DROP + CREATE (no CREATE OR REPLACE) porque insertar una columna en
--    medio de la lista cambia el nombre posicional de columnas existentes, lo
--    que CREATE OR REPLACE VIEW rechaza (SQLSTATE 42P16).
drop view if exists public.catalog_events_v2;
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
  (
    select performance.time_known
    from public.performances as performance
    where performance.event_id = event.id and performance.starts_at >= now()
    order by performance.starts_at
    limit 1
  ) as next_performance_time_known,
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
    -- `time_known` va dentro de jsonb_strip_nulls, que solo elimina null, no
    -- false: un false sobrevive y el front lo lee para omitir la hora.
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'starts_at', performance.starts_at,
      'timezone', performance.timezone,
      'status', performance.status,
      'time_known', performance.time_known,
      'performance_code', performance.performance_code,
      'purchase_url', performance.purchase_url
    )) order by performance.starts_at)
    from public.performances as performance
    where performance.event_id = event.id
  ), '[]'::jsonb) as performances
from public.events as event;

revoke all on table public.catalog_events_v2 from anon, authenticated;
grant select on table public.catalog_events_v2 to anon, authenticated, service_role;

-- 3) RPC persist_normalized_event: acepta/escribe time_known (default true si
--    el payload no lo trae). Cuerpo idéntico al vigente salvo esa columna;
--    conserva security invoker, search_path vacío e idempotencia por
--    (event_id, starts_at) con la guarda de source_extracted_at.
create or replace function public.persist_normalized_event(p_run_id bigint, p_event jsonb)
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

  -- Funciones del canónico. time_known: default true si el payload no lo trae.
  for v_performance in
    select item.value from jsonb_array_elements(coalesce(p_event->'performances', '[]'::jsonb)) as item(value)
    order by (item.value->>'starts_at')::timestamptz, coalesce(item.value->>'performance_code', '')
  loop
    insert into public.performances as pf (
      event_id, starts_at, timezone, status, time_known, performance_code, purchase_url,
      source_extracted_at, first_seen_at, last_seen_at
    ) values (
      v_event_id,
      (v_performance->>'starts_at')::timestamptz,
      v_performance->>'timezone',
      coalesce(nullif(btrim(v_performance->>'status'), ''), 'unknown'),
      coalesce((v_performance->>'time_known')::boolean, true),
      nullif(btrim(v_performance->>'performance_code'), ''),
      nullif(btrim(v_performance->>'purchase_url'), ''),
      v_extracted_at, v_extracted_at, v_extracted_at
    )
    on conflict (event_id, starts_at) do update set
      timezone = coalesce(nullif(btrim(excluded.timezone), ''), pf.timezone),
      status = case when excluded.status = 'unknown' and pf.status <> 'unknown' then pf.status else excluded.status end,
      time_known = coalesce((excluded.time_known), pf.time_known),
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

-- Reverso (no ejecutado; referencia para revertir):
--   alter table public.performances drop column if exists time_known;
--   luego recrear catalog_events_v2 y persist_normalized_event con el cuerpo de
--   20260913223740_canonical_events_model.sql (sin time_known).
