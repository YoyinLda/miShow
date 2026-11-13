import { describe, expect, it } from "vitest";
import type { RawEventReference } from "@mishow/domain";
import type { SourceAdapter } from "../src/adapter.js";
import { buildDiscoveryReport, mergeReferences } from "../src/acquisition/discovery.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const HOST = "www.puntoticket.com";
const BASE_SEED = 0x5eed05;
const ITERATIONS = 150;

const adapter = {
  source: "puntoticket",
  name: "PuntoTicket",
  baseUrl: `https://${HOST}`,
  host: HOST,
  listingUrl: `https://${HOST}/musica`,
  purchasePathPatterns: [/^\/comprar(\/|$)/i, /^\/pago(\/|$)/i]
} as unknown as SourceAdapter;

const canonical = (slug: string): string => `https://${HOST}/evento/${slug}`;

/** Variante no canónica de la misma URL (host en mayúsculas, barra final, query, fragmento). */
function variant(prng: Prng, slug: string): string {
  let url = canonical(slug);
  if (prng.bool()) url = url.replace(HOST, HOST.toUpperCase());
  if (prng.bool()) url += "/";
  if (prng.bool()) url += `?utm=${prng.int(0, 99)}`;
  if (prng.bool()) url += "#frag";
  return url;
}

function pickSlugs(prng: Prng, pool: string[], max: number): string[] {
  const n = prng.int(0, max);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(prng.pick(pool)); // puede repetir
  return out;
}

function toRefs(prng: Prng, slugs: string[]): RawEventReference[] {
  return slugs.map((slug) => (prng.bool() ? { source_url: variant(prng, slug), title: `T ${slug}` } : { source_url: variant(prng, slug) }));
}

const unique = (items: string[]): string[] => [...new Set(items)];

describe("discovery merge (propiedad)", () => {
  // Feature: puntoticket-venue-discovery, Property 5: Clasificación, deduplicación e invariante del reporte
  it("Property 5: Clasificación, deduplicación e invariante del reporte", async () => {
    // Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 3.7
    await runIterations(ITERATIONS, BASE_SEED, (prng) => {
      const pool = Array.from({ length: prng.int(1, 14) }, (_, k) => `ev-${k}`);
      const musicaSlugs = pickSlugs(prng, pool, 10);
      const pages = Array.from({ length: prng.int(0, 5) }, (_, k) => ({
        page: `https://${HOST}/recintos/v${k}`,
        slugs: pickSlugs(prng, pool, 8)
      }));

      const musica = toRefs(prng, musicaSlugs);
      const venue = pages.map((p) => ({ page: p.page, refs: toRefs(prng, p.slugs) }));

      const merged = mergeReferences(adapter, musica, venue);

      const M = new Set(musicaSlugs.map(canonical));
      const V = new Set(pages.flatMap((p) => p.slugs).map(canonical));
      const expectedMissing = [...V].filter((u) => !M.has(u));
      const expectedUnion = new Set([...M, ...V]);

      // Dedupe: cada URL canónica una sola vez.
      const urls = merged.map((m) => m.reference.source_url);
      expect(urls.length).toBe(new Set(urls).size);
      expect(new Set(urls)).toEqual(expectedUnion);

      // Origins coherentes con pertenencia a M y V.
      for (const item of merged) {
        const u = item.reference.source_url;
        const expected = [...(M.has(u) ? ["musica"] : []), ...(V.has(u) ? ["venue"] : [])];
        expect(item.origins).toEqual(expected);
      }

      const summary = { requested: pages.length, succeeded: pages.length, failed: 0 };
      const report = buildDiscoveryReport(merged, summary);

      // missing es exactamente V \ M, sin duplicados.
      expect(report.missing.length).toBe(unique(report.missing).length);
      expect(new Set(report.missing)).toEqual(new Set(expectedMissing));
      expect(report.missing_count).toBe(report.missing.length);
      expect(report.missing.some((u) => M.has(u))).toBe(false);

      // Invariantes del reporte.
      expect(report.musica_unique).toBe(M.size);
      expect(report.venue_unique).toBe(V.size);
      expect(report.both).toBe([...M].filter((u) => V.has(u)).length);
      expect(report.total_unique).toBe(report.musica_unique + report.missing_count);
      expect(report.venue_unique).toBe(report.both + report.missing_count);
      expect(report.total_unique).toBe(merged.length);
      expect(report.venue_pages.requested).toBe(report.venue_pages.succeeded + report.venue_pages.failed);
    });
  });
});
