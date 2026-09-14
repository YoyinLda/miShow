-- Brief 004 — Vistas de lectura para páginas de Artista y Venue.
--
-- Exponen la entidad canónica más sus PRÓXIMOS eventos (para el listado de la
-- página). Solo lectura pública (security_invoker; las tablas base ya tienen RLS
-- de solo lectura para anon/authenticated). Aditiva y reversible.

-- Eventos próximos reutilizables como sub-consulta: un objeto compacto por evento
-- con lo necesario para una tarjeta (id, slug, name, next_performance_at, venue).
-- Se define inline en cada vista para no crear dependencias extra.

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
      where ea.artist_id = artist.id
    ) as ev
  ), '[]'::jsonb) as events
from public.artists as artist;

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
      where e.venue_id = venue.id
    ) as ev
  ), '[]'::jsonb) as events
from public.venues as venue;

revoke all on table public.catalog_artists_v1 from anon, authenticated;
revoke all on table public.catalog_venues_v1 from anon, authenticated;
grant select on table public.catalog_artists_v1 to anon, authenticated, service_role;
grant select on table public.catalog_venues_v1 to anon, authenticated, service_role;
