-- Agrega el venue Munich y su fuente PuntoTicket (https://www.puntoticket.com/munich).
-- Idempotente: reutiliza el venue si ya existe (por normalized_name o slug) y no
-- duplica la fila de venue_sources. Nombre y slug de la fuente provistos por TL/PO.
-- Nota: el nombre 'Munich' es el que se asume para el match por normalized_name;
-- ajustar si los eventos lo reportan distinto.

do $$
declare
  v_venue_id bigint;
begin
  select id into v_venue_id
  from public.venues
  where normalized_name = 'munich' or slug = 'munich'
  order by (normalized_name = 'munich') desc
  limit 1;

  if v_venue_id is null then
    insert into public.venues (slug, normalized_name, name)
    values ('munich', 'munich', 'Munich')
    returning id into v_venue_id;
  end if;

  insert into public.venue_sources (venue_id, source, source_slug, source_url)
  values (v_venue_id, 'puntoticket', 'munich', 'https://www.puntoticket.com/munich')
  on conflict (source, source_slug) do nothing;
end
$$;

