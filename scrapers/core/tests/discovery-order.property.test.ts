import { describe, expect, it } from "vitest";
import type { RawEventReference } from "@mishow/domain";
import type { SourceAdapter } from "../src/adapter.js";
import { mergeReferences } from "../src/acquisition/discovery.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const HOST = "www.puntoticket.com";
const BASE_SEED = 0x5eed06;
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
  for (let i = 0; i < n; i++) out.push(prng.pick(pool));
  return out;
}

const toRefs = (prng: Prng, slugs: string[]): RawEventReference[] =>
  slugs.map((slug) => ({ source_url: variant(prng, slug) }));

const firstOccurrence = (items: string[]): string[] => [...new Set(items)];

describe("discovery order (propiedad)", () => {
  // Feature: puntoticket-venue-discovery, Property 6: Orden determinista y prioridad de /musica
  it("Property 6: Orden determinista y prioridad de /musica", async () => {
    // Validates: Requirements 2.1, 3.3, 3.4, 5.9
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
      const urls = merged.map((m) => m.reference.source_url);

      // Orden esperado: /musica (orden original), luego exclusivas de venue (índice y aparición).
      const M = firstOccurrence(musicaSlugs).map(canonical);
      const mSet = new Set(M);
      const V = firstOccurrence(pages.flatMap((p) => p.slugs)).map(canonical);
      const expected = [...M, ...V.filter((u) => !mSet.has(u))];
      expect(urls).toEqual(expected);

      // Determinismo.
      expect(mergeReferences(adapter, musica, venue)).toEqual(merged);

      // Para todo k, las primeras min(k, |M|) son de /musica.
      for (let k = 0; k <= merged.length; k++) {
        const head = merged.slice(0, Math.min(k, M.length));
        expect(head.every((m) => m.origins.includes("musica"))).toBe(true);
        expect(head.map((m) => m.reference.source_url)).toEqual(M.slice(0, head.length));
      }
    });
  });
});
