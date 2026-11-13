-- Tabla venue_sources: relaciona un venue canónico con su identificador y URL
-- en cada fuente/ticketera (alimenta el descubrimiento `db-venues`).
--
-- SUPUESTO: para `puntoticket`, `venues.slug` coincide con el slug de la página
-- de venue en PuntoTicket (https://www.puntoticket.com/<slug>). Es un supuesto
-- derivado, no verificado: si algún slug no coincide, se corrige actualizando
-- `venue_sources.source_slug` / `source_url` de esa fila (service_role); el
-- backfill es idempotente y no sobrescribe filas existentes.

create table public.venue_sources (
  id bigint generated always as identity primary key,
  venue_id bigint not null references public.venues(id) on delete cascade,
  source text not null,
  source_slug text not null,
  source_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint venue_sources_source_slug_key unique (source, source_slug),
  constraint venue_sources_source_not_blank check (btrim(source) <> ''),
  constraint venue_sources_source_slug_not_blank check (btrim(source_slug) <> ''),
  constraint venue_sources_source_url_https check (source_url ~ '^https://[^[:space:]]+$')
);

create index venue_sources_venue_idx on public.venue_sources (venue_id);

-- RLS y grants (lectura pública; escritura solo service_role), como el catálogo.
alter table public.venue_sources enable row level security;

revoke all on table public.venue_sources from anon, authenticated;
grant select on table public.venue_sources to anon, authenticated;
grant select, insert, update on table public.venue_sources to service_role;
grant usage on sequence public.venue_sources_id_seq to service_role;

create policy venue_sources_catalog_read on public.venue_sources
  for select to anon, authenticated using (true);

-- Backfill idempotente para PuntoTicket desde venues.slug.
create or replace function public.backfill_venue_sources_puntoticket()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted bigint;
begin
  insert into public.venue_sources (venue_id, source, source_slug, source_url)
  select venue.id, 'puntoticket', venue.slug, 'https://www.puntoticket.com/' || venue.slug
  from public.venues as venue
  where venue.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  on conflict (source, source_slug) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.backfill_venue_sources_puntoticket() from public, anon, authenticated;
grant execute on function public.backfill_venue_sources_puntoticket() to service_role;

select public.backfill_venue_sources_puntoticket();
