import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Inspección automatizada de las migraciones (sin Supabase local disponible).
// Requisitos: 11.2, 11.3, 11.4, 11.7, 14.1.
const dir = resolve(import.meta.dirname, "../../../supabase/migrations");
const read = (f: string) => readFileSync(resolve(dir, f), "utf8");
const norm = (s: string) => s.replace(/--.*$/gm, "").replace(/\s+/g, " ").toLowerCase();

const venueSources = norm(read("20261005120000_venue_sources.sql"));
const report = norm(read("20261006120000_scrape_runs_discovery_report.sql"));

describe("migración venue_sources", () => {
  it("define constraints: unique, no vacío, HTTPS, FK cascade e índice", () => {
    expect(venueSources).toContain("unique (source, source_slug)");
    expect(venueSources).toContain("check (btrim(source) <> '')");
    expect(venueSources).toContain("check (btrim(source_slug) <> '')");
    expect(venueSources).toContain("check (source_url ~ '^https://[^[:space:]]+$')");
    expect(venueSources).toContain("venue_id bigint not null references public.venues(id) on delete cascade");
    expect(venueSources).toContain("create index venue_sources_venue_idx on public.venue_sources (venue_id)");
  });

  it("el check HTTPS acepta https sin espacios y rechaza http/espacios", () => {
    const re = /^https:\/\/\S+$/;
    expect(re.test("https://www.puntoticket.com/teatro-caupolican")).toBe(true);
    expect(re.test("http://www.puntoticket.com/x")).toBe(false);
    expect(re.test("https://a b")).toBe(false);
    expect(re.test("https://")).toBe(false);
  });

  it("habilita RLS con lectura pública y escritura solo service_role", () => {
    expect(venueSources).toContain("alter table public.venue_sources enable row level security");
    expect(venueSources).toContain("revoke all on table public.venue_sources from anon, authenticated");
    expect(venueSources).toContain("grant select on table public.venue_sources to anon, authenticated");
    expect(venueSources).toContain("grant select, insert, update on table public.venue_sources to service_role");
    expect(venueSources).toMatch(/create policy \w+ on public\.venue_sources for select to anon, authenticated using \(true\)/);
    // sin escritura para anon/authenticated ni policies de escritura
    expect(venueSources).not.toMatch(/grant [^;]*(insert|update|delete)[^;]* to [^;]*(anon|authenticated)/);
    expect(venueSources).not.toMatch(/for (insert|update|delete|all)/);
  });

  it("backfill es idempotente, valida slug y está restringido a service_role", () => {
    expect(venueSources).toContain("on conflict (source, source_slug) do nothing");
    expect(venueSources).toContain("venue.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
    expect(venueSources).toContain("'https://www.puntoticket.com/' || venue.slug");
    expect(venueSources).toContain(
      "revoke execute on function public.backfill_venue_sources_puntoticket() from public, anon, authenticated"
    );
    expect(venueSources).toContain(
      "grant execute on function public.backfill_venue_sources_puntoticket() to service_role"
    );
    expect(venueSources).toContain("select public.backfill_venue_sources_puntoticket()");
  });

  it("aplicar el backfill dos veces deja las mismas filas (modelo del SQL)", () => {
    const slugRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    const venues = ["teatro-caupolican", "Bad Slug", "movistar-arena", "x--y", "teatro-caupolican-2"];
    const table = new Map<string, { source_slug: string; source_url: string }>();
    const backfill = () => {
      let inserted = 0;
      for (const slug of venues) {
        if (!slugRe.test(slug)) continue;
        const key = `puntoticket|${slug}`;
        if (table.has(key)) continue; // on conflict do nothing
        table.set(key, { source_slug: slug, source_url: `https://www.puntoticket.com/${slug}` });
        inserted++;
      }
      return inserted;
    };
    expect(backfill()).toBe(3);
    const first = JSON.stringify([...table]);
    expect(backfill()).toBe(0);
    expect(JSON.stringify([...table])).toBe(first);
  });
});

describe("migración scrape_runs.discovery_report", () => {
  it("agrega columna jsonb nula con check null/objeto, idempotente y sin cambios RLS/grants", () => {
    expect(report).toContain("add column if not exists discovery_report jsonb;");
    expect(report).toContain(
      "check (discovery_report is null or jsonb_typeof(discovery_report) = 'object')"
    );
    expect(report).toContain("if not exists ( select 1 from pg_constraint where conname = 'scrape_runs_discovery_report_object'");
    expect(report).not.toMatch(/\bgrant\b|\brevoke\b|row level security|create policy/);
    expect(report).not.toMatch(/discovery_report jsonb not null/);
  });

  it("el check acepta null/objeto y rechaza escalares y arreglos (modelo)", () => {
    const jsonbType = (v: unknown) =>
      Array.isArray(v) ? "array" : typeof v === "object" ? "object" : typeof v;
    const ok = (v: unknown) => v === null || jsonbType(v) === "object";
    expect(ok(null)).toBe(true);
    expect(ok({})).toBe(true);
    expect(ok({ discovered: 3 })).toBe(true);
    for (const bad of [1, "x", true, [1]]) expect(ok(bad)).toBe(false);
  });
});
