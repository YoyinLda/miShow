import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../../supabase/migrations/20261009120000_venue_sources_status.sql"), "utf8")
  .replace(/--.*$/gm, "")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("migración venue_sources_status", () => {
  it("agrega status con check y last_checked_at de forma idempotente", () => {
    expect(sql).toContain("add column if not exists status text not null default 'candidate'");
    expect(sql).toContain("add column if not exists last_checked_at timestamptz");
    expect(sql).toContain("check (status in ('candidate', 'active', 'not_found'))");
    expect(sql).toContain("if not exists ( select 1 from pg_constraint where conname = 'venue_sources_status_check'");
  });

  it("crea candidatas solo para venues sin fila de esa fuente y respeta slugs por ticketera", () => {
    expect(sql).toContain("not exists ( select 1 from public.venue_sources as existing where existing.venue_id = venue.id and existing.source = p_source )");
    expect(sql).toContain("on conflict (source, source_slug) do nothing");
    expect(sql).toContain("errcode = '22023', message = 'unknown venue source'");
  });

  it("trigger idempotente en venues que no falla con slug inválido", () => {
    expect(sql).toContain("drop trigger if exists venues_create_source_candidates on public.venues");
    expect(sql).toContain("create trigger venues_create_source_candidates after insert on public.venues for each row");
    expect(sql).toContain("if new.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' then");
  });

  it("RPC de verificaciones: valida status y solo service_role", () => {
    expect(sql).toContain("(item->>'status') not in ('active', 'not_found')");
    for (const fn of ["ensure_venue_source_candidates(text)", "record_venue_source_checks(text, jsonb)"]) {
      expect(sql).toContain(`revoke execute on function public.${fn} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${fn} to service_role`);
    }
  });
});
