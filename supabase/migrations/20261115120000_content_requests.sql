-- Brief 009 · C — Canal de retiro de contenido.
--
-- 1) events.hidden_at: oculta un evento puntual de las vistas públicas.
-- 2) sources.enabled: kill switch por fuente (sus eventos, links y precios dejan
--    de exponerse en minutos).
-- 3) content_requests: solicitudes desde /contacto. anon solo puede INSERTAR
--    (sin lectura); rate limit por trigger. Un workflow (cada 30 min) abre un
--    issue 'retiro-contenido' y marca la fila como notificada.
--
-- Idempotente y reversible (ver reverso al final).

alter table public.events add column if not exists hidden_at timestamptz;
alter table public.sources add column if not exists enabled boolean not null default true;

create table if not exists public.content_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  organization text,
  email text not null,
  event_url text,
  reason text not null,
  status text not null default 'pending',
  issue_number integer,
  notified_at timestamptz,
  resolved_at timestamptz,
  constraint content_requests_status_check check (status in ('pending', 'notified', 'resolved', 'rejected')),
  constraint content_requests_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint content_requests_org_len check (organization is null or char_length(organization) <= 160),
  constraint content_requests_email_format check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  constraint content_requests_url_len check (event_url is null or (char_length(event_url) <= 500 and event_url ~* '^https?://')),
  constraint content_requests_reason_len check (char_length(btrim(reason)) between 10 and 4000)
);

create index if not exists content_requests_pending_idx on public.content_requests (created_at) where status = 'pending';
create index if not exists content_requests_email_idx on public.content_requests (lower(email), created_at);

alter table public.content_requests enable row level security;
revoke all on table public.content_requests from anon, authenticated;
grant insert (name, organization, email, event_url, reason) on table public.content_requests to anon, authenticated;
grant all on table public.content_requests to service_role;

drop policy if exists content_requests_insert_public on public.content_requests;
create policy content_requests_insert_public on public.content_requests
  for insert to anon, authenticated
  with check (status = 'pending' and issue_number is null and notified_at is null and resolved_at is null);

-- Rate limit: máx. 3 solicitudes por correo por hora y 30 en total por hora.
-- security definer porque anon no puede leer la tabla.
create or replace function public.content_requests_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.content_requests
      where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  if (select count(*) from public.content_requests where created_at > now() - interval '1 hour') >= 30 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  return new;
end;
$$;

revoke execute on function public.content_requests_rate_limit() from public, anon, authenticated;

drop trigger if exists content_requests_rate_limit on public.content_requests;
create trigger content_requests_rate_limit
  before insert on public.content_requests
  for each row execute function public.content_requests_rate_limit();

-- Vistas públicas: además de category = 'musica' (brief 007), excluyen eventos
-- ocultos (hidden_at) y los que no tienen ninguna fuente habilitada; las fuentes
-- deshabilitadas no aparecen en `sources`.
create or replace view public.catalog_events_v2
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
    where es.event_id = event.id and src.enabled
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
from public.events as event
where event.category = 'musica'
  and event.hidden_at is null and exists (
    select 1 from public.event_sources as vis_es join public.sources as vis_src on vis_src.id = vis_es.source_id
    where vis_es.event_id = event.id and vis_src.enabled
  );

revoke all on table public.catalog_events_v2 from anon, authenticated;
grant select on table public.catalog_events_v2 to anon, authenticated, service_role;

create or replace view public.catalog_artists_v1
with (security_invoker = true)
as
select
  artist.id,
  artist.slug,
  artist.name,
  artist.description,
  artist.city,
  artist.country,
  artist.genre,
  artist.image_url,
  artist.links,
  artist.verified,
  coalesce((
    select jsonb_agg(ev order by ev.next_at nulls last, ev.name)
    from (
      select
        e.id,
        e.slug,
        e.name,
        e.image_url,
        e.status,
        (
          select min(p.starts_at)
          from public.performances p
          where p.event_id = e.id and p.starts_at >= now()
        ) as next_at,
        (select v.name from public.venues v where v.id = e.venue_id) as venue_name,
        (select v.slug from public.venues v where v.id = e.venue_id) as venue_slug
      from public.events e
      join public.event_artists ea on ea.event_id = e.id
      where ea.artist_id = artist.id and e.category = 'musica'
        and e.hidden_at is null and exists (
    select 1 from public.event_sources as vis_es join public.sources as vis_src on vis_src.id = vis_es.source_id
    where vis_es.event_id = e.id and vis_src.enabled
  )
    ) as ev
  ), '[]'::jsonb) as events
from public.artists as artist
-- Oculta artistas que solo aparecen en eventos no musicales (p. ej. clubes de fútbol).
where exists (
  select 1 from public.event_artists ea join public.events e on e.id = ea.event_id
  where ea.artist_id = artist.id and e.category = 'musica' and e.hidden_at is null and exists (
    select 1 from public.event_sources as vis_es join public.sources as vis_src on vis_src.id = vis_es.source_id
    where vis_es.event_id = e.id and vis_src.enabled
  )
) or not exists (
  select 1 from public.event_artists ea where ea.artist_id = artist.id
);

create or replace view public.catalog_venues_v1
with (security_invoker = true)
as
select
  venue.id,
  venue.slug,
  venue.name,
  venue.address,
  venue.city,
  venue.latitude,
  venue.longitude,
  venue.capacity,
  venue.links,
  venue.image_url,
  coalesce((
    select jsonb_agg(ev order by ev.next_at nulls last, ev.name)
    from (
      select
        e.id,
        e.slug,
        e.name,
        e.image_url,
        e.status,
        (
          select min(p.starts_at)
          from public.performances p
          where p.event_id = e.id and p.starts_at >= now()
        ) as next_at,
        coalesce((
          select jsonb_agg(jsonb_build_object('name', a.name, 'slug', a.slug) order by ea.position)
          from public.event_artists ea
          join public.artists a on a.id = ea.artist_id
          where ea.event_id = e.id
        ), '[]'::jsonb) as artists
      from public.events e
      where e.venue_id = venue.id and e.category = 'musica'
        and e.hidden_at is null and exists (
    select 1 from public.event_sources as vis_es join public.sources as vis_src on vis_src.id = vis_es.source_id
    where vis_es.event_id = e.id and vis_src.enabled
  )
    ) as ev
  ), '[]'::jsonb) as events
from public.venues as venue;


revoke all on table public.catalog_artists_v1 from anon, authenticated;
revoke all on table public.catalog_venues_v1 from anon, authenticated;
grant select on table public.catalog_artists_v1 to anon, authenticated, service_role;
grant select on table public.catalog_venues_v1 to anon, authenticated, service_role;

-- Reverso (no ejecutado; referencia):
--   recrear las vistas desde 20261114120000_events_music_only.sql;
--   drop trigger content_requests_rate_limit on public.content_requests;
--   drop function public.content_requests_rate_limit(); drop table public.content_requests;
--   alter table public.events drop column hidden_at; alter table public.sources drop column enabled;
