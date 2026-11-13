-- Candidatos automáticos por ticketera y estado de verificación de venue_sources.
-- Cada ticketera puede tener un slug distinto por venue (unique por source + source_slug).
-- Los venues nuevos reciben una fila candidata por trigger; el scraper marca cada fila
-- como active (la página respondió) o not_found (404) y reintenta las not_found tras N días.

alter table public.venue_sources
  add column if not exists status text not null default 'candidate',
  add column if not exists last_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venue_sources_status_check'
      and conrelid = 'public.venue_sources'::regclass
  ) then
    alter table public.venue_sources
      add constraint venue_sources_status_check
      check (status in ('candidate', 'active', 'not_found'));
  end if;
end
$$;

-- Base de URL por fuente conocida. Fuente desconocida => excepción.
create or replace function public.venue_source_base_url(p_source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_source when 'puntoticket' then 'https://www.puntoticket.com/' end;
$$;

-- Crea una fila candidata (slug = venues.slug) para cada venue sin fila en p_source.
create or replace function public.ensure_venue_source_candidates(p_source text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_base text := public.venue_source_base_url(p_source);
  v_inserted bigint;
begin
  if v_base is null then
    raise exception using errcode = '22023', message = 'unknown venue source';
  end if;
  insert into public.venue_sources (venue_id, source, source_slug, source_url)
  select venue.id, p_source, venue.slug, v_base || venue.slug
  from public.venues as venue
  where venue.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and not exists (
      select 1 from public.venue_sources as existing
      where existing.venue_id = venue.id and existing.source = p_source
    )
  on conflict (source, source_slug) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.ensure_venue_source_candidates(text) from public, anon, authenticated;
grant execute on function public.ensure_venue_source_candidates(text) to service_role;

-- El backfill histórico pasa a ser un wrapper.
create or replace function public.backfill_venue_sources_puntoticket()
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select public.ensure_venue_source_candidates('puntoticket');
$$;

revoke execute on function public.backfill_venue_sources_puntoticket() from public, anon, authenticated;
grant execute on function public.backfill_venue_sources_puntoticket() to service_role;

-- Trigger: cada venue nuevo genera su candidata por fuente conocida (no falla si el slug es inválido).
create or replace function public.venues_create_source_candidates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    insert into public.venue_sources (venue_id, source, source_slug, source_url)
    values (new.id, 'puntoticket', new.slug, 'https://www.puntoticket.com/' || new.slug)
    on conflict (source, source_slug) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists venues_create_source_candidates on public.venues;
create trigger venues_create_source_candidates
  after insert on public.venues
  for each row execute function public.venues_create_source_candidates();

-- Registra el resultado de verificar páginas: [{source_slug, status: active|not_found}].
create or replace function public.record_venue_source_checks(p_source text, p_checks jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated bigint;
begin
  if p_checks is null or jsonb_typeof(p_checks) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid checks';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_checks) as item
    where jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item->'source_slug') is distinct from 'string'
       or (item->>'status') is null
       or (item->>'status') not in ('active', 'not_found')
  ) then
    raise exception using errcode = '22023', message = 'invalid check item';
  end if;
  update public.venue_sources as vs
  set status = item.status,
      last_checked_at = now(),
      updated_at = now()
  from jsonb_to_recordset(p_checks) as item(source_slug text, status text)
  where vs.source = p_source and vs.source_slug = item.source_slug;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.record_venue_source_checks(text, jsonb) from public, anon, authenticated;
grant execute on function public.record_venue_source_checks(text, jsonb) to service_role;

select public.ensure_venue_source_candidates('puntoticket');
