import { describe, expect, it } from "vitest";
import type { SourceAdapter } from "../src/adapter.js";
import { canonicalKey } from "../src/acquisition/discovery.js";
import { createPrng, runIterations, type Prng } from "./helpers/prng.js";

const HOST = "www.puntoticket.com";
const adapter = {
  host: HOST,
  purchasePathPatterns: [/^\/queue\/enqueue\/[^/?#]+$/i, /^\/comprar\/evento\/[^/?#]+\/cal\/[^/?#]+$/i],
} as unknown as SourceAdapter;

const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-";

function slug(prng: Prng): string {
  const len = prng.int(1, 20);
  let out = "";
  for (let i = 0; i < len; i++) out += SLUG_CHARS[prng.int(0, SLUG_CHARS.length - 1)];
  return out;
}

function randomCase(prng: Prng, value: string): string {
  return [...value].map((c) => (prng.bool() ? c.toUpperCase() : c.toLowerCase())).join("");
}

/** URL base de evento (forma canónica) y una variante que solo difiere en host/barra/query/fragmento. */
function eventUrls(prng: Prng): { base: string; variant: string } {
  const path = `/evento/${slug(prng)}`;
  const base = `https://${HOST}${path}`;
  const query = prng.bool() ? `?${slug(prng)}=${slug(prng)}${prng.bool() ? `&${slug(prng)}=${slug(prng)}` : ""}` : "";
  const fragment = prng.bool() ? `#${slug(prng)}` : "";
  const trailing = "/".repeat(prng.int(0, 3));
  const host = prng.bool() ? randomCase(prng, HOST) : HOST;
  return { base, variant: `https://${host}${path}${trailing}${query}${fragment}` };
}

describe("canonicalKey (descubrimiento)", () => {
  it("// Feature: puntoticket-venue-discovery, Property 4: Canonicalización idempotente y estable ante variantes", async () => {
    // **Validates: Requirements 3.5, 4.1**
    await runIterations(200, 4_000, (prng) => {
      const { base, variant } = eventUrls(prng);
      const key = canonicalKey(adapter, base);
      expect(key).toBeDefined();
      expect(canonicalKey(adapter, variant)).toBe(key);
      expect(canonicalKey(adapter, key as string)).toBe(key);
    });
  });

  it("es determinista con la misma semilla", () => {
    const a = eventUrls(createPrng(1));
    const b = eventUrls(createPrng(1));
    expect(a).toEqual(b);
  });
});
