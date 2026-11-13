-- finish_scrape_run persiste scrape_runs.discovery_report (puntoticket-venue-discovery, Req. 14.2, 14.3, 14.6).
-- Idempotente: el mismo p_result deja el mismo valor. Ausente o JSON null => SQL null.
-- create or replace conserva los grants existentes (solo service_role).

create or replace function public.finish_scrape_run(p_run_id bigint, p_result jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text := p_result->>'status';
  v_report jsonb := nullif(p_result->'discovery_report', 'null'::jsonb);
begin
  if v_status not in ('succeeded', 'partial', 'failed') then
    raise exception using errcode = '22023', message = 'invalid final run status';
  end if;
  if v_report is not null and jsonb_typeof(v_report) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid discovery report';
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
      discovery_report = v_report,
      updated_at = now()
  where id = p_run_id and status = 'running';
  if not found then
    raise exception using errcode = '22023', message = 'run does not exist or is already finished';
  end if;
  return jsonb_build_object('run_id', p_run_id::text, 'status', v_status);
end;
$$;
