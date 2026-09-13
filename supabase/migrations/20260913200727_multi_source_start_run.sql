-- Persistencia multi-fuente: generaliza `start_scrape_run` para que el nombre y
-- la base_url del `source` provengan del payload (`source_name`,
-- `source_base_url`) en vez de los literales de PuntoTicket.
--
-- Cambio aditivo y retrocompatible: si el payload no trae esos campos (p. ej.
-- clientes antiguos), se usan los valores de PuntoTicket como fallback, de modo
-- que el comportamiento vigente no cambia. El resto de la lógica (scrape_runs)
-- se conserva idéntica. Reversible: la versión previa vive en la migración
-- 20260909151251_puntoticket_persistence.sql.

create or replace function public.start_scrape_run(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_id bigint;
  v_run_id bigint;
  v_source_name text;
  v_source_base_url text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception using errcode = '22023', message = 'start run input must be an object';
  end if;
  if nullif(btrim(p_input->>'source'), '') is null or nullif(btrim(p_input->>'listing_url'), '') is null then
    raise exception using errcode = '22023', message = 'source and listing_url are required';
  end if;

  -- Identidad de la fuente tomada del payload, con fallback a PuntoTicket para
  -- compatibilidad con clientes que aún no envían source_name/source_base_url.
  v_source_name := coalesce(nullif(btrim(p_input->>'source_name'), ''), 'PuntoTicket');
  v_source_base_url := coalesce(nullif(btrim(p_input->>'source_base_url'), ''), 'https://www.puntoticket.com');

  if v_source_base_url !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'source_base_url must be an https URL';
  end if;

  insert into public.sources as current (code, name, base_url)
  values (p_input->>'source', v_source_name, v_source_base_url)
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
