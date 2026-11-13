-- Reporte de descubrimiento de venues por corrida (puntoticket-venue-discovery, Req. 14.1).
-- Nulo cuando la corrida no ejecutó descubrimiento. Sin cambios de RLS/grants:
-- scrape_runs ya restringe la escritura a service_role.

alter table public.scrape_runs
  add column if not exists discovery_report jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scrape_runs_discovery_report_object'
      and conrelid = 'public.scrape_runs'::regclass
  ) then
    alter table public.scrape_runs
      add constraint scrape_runs_discovery_report_object
      check (discovery_report is null or jsonb_typeof(discovery_report) = 'object');
  end if;
end
$$;

comment on column public.scrape_runs.discovery_report is
  'Reporte de descubrimiento de venues (solo URLs canónicas y conteos). Null si no hubo descubrimiento.';
