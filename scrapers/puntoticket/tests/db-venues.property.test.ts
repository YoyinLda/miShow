import { describe, expect, it } from "vitest";
import { canonicalSourceUrl } from "@mishow/domain";
import { validateAcquisitionUrl } from "@mishow/scraper-core";
import { createPuntoticketAdapter } from "../src/adapter.js";
import { createDbVenuesIndex, type VenueSourceRow } from "../src/discovery/db-venues.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const BASE_SEED = 12_012;
const ITERATIONS = 150;
const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function segment(prng: Prng): string {
  const len = prng.int(1, 8);
  let s = "";
  for (let i = 0; i < len; i++) s += CHARS[prng.int(0, CHARS.length - 1)];
  return s;
}

function slug(prng: Prng): string {
  const parts = prng.int(1, 3);
  return Array.from({ length: parts }, () => segment(prng)).join("-");
}

const ORIGIN = "https://www.puntoticket.com";
const BLOCKED_PREFIXES = ["musica", "comprar", "queue", "login", "pago", "teatro", "checkout", "cuenta"];

describe("db-venues (propiedades)", () => {
  // Feature: puntoticket-venue-discovery, Property 13: La allowlist rechaza toda ruta fuera del conjunto
  // **Validates: Requirements 12.3, 12.4, 12.6**
  it("Propiedad 13: la allowlist rechaza toda ruta fuera del conjunto o bloqueada", async () => {
    await runIterations(ITERATIONS, BASE_SEED + 1_000, async (prng) => {
      const n = prng.int(0, 12);
      const rows: VenueSourceRow[] = [];
      for (let k = 0; k < n; k++) {
        // Con probabilidad 0.2 el slug es de un prefijo bloqueado (p. ej. "pago-x" o "musica").
        const s = prng.bool(0.2) ? `${prng.pick(BLOCKED_PREFIXES)}${prng.bool() ? `-${segment(prng)}` : ""}` : slug(prng);
        rows.push({ source_slug: s, source_url: `${ORIGIN}/${s}` });
      }
      const valid = new Set(rows.map((r) => r.source_slug));

      // Filas inconsistentes: source_url no corresponde al slug (slugs distintos de los válidos).
      const bad: VenueSourceRow[] = [];
      for (let k = prng.int(0, 4); k > 0; k--) {
        const s = `bad-${slug(prng)}`;
        if (valid.has(s)) continue;
        const url = prng.pick([`${ORIGIN}/other-${segment(prng)}`, `${ORIGIN}/${s}/sub`, `https://evil.example/${s}`]);
        bad.push({ source_slug: s, source_url: url });
      }
      const all = [...rows, ...bad].sort(() => (prng.bool() ? 1 : -1));

      const index = createDbVenuesIndex(async () => all);
      await index.list({} as never);
      const adapter = createPuntoticketAdapter({ venueIndex: index });
      const discovery = adapter.discovery!;
      const ctx = { secondaryListing: true };

      const outside: string[] = [];
      for (let k = prng.int(1, 10); k > 0; k--) {
        const s = slug(prng);
        outside.push(
          `/${s}`,
          `/${s}/extra`,
          `/${prng.pick(BLOCKED_PREFIXES)}/${segment(prng)}`,
          `/../${s}`,
          `/%2e%2e/${s}`,
          `/${s}%2Fx`
        );
      }
      for (const b of bad) outside.push(`/${b.source_slug}`);
      for (const r of rows) outside.push(`/${r.source_slug}/`, `/${r.source_slug}/sub`, `/${r.source_slug.toUpperCase()}x`);

      for (const path of outside) {
        const inSet = index.allowedPaths().has(path);
        const expected = inSet && !adapter.isBlockedPath(path, "listing");
        expect(discovery.isSecondaryPagePath(path), path).toBe(expected);
        if (!expected) {
          expect(() => validateAcquisitionUrl(adapter, `${ORIGIN}${path}`, "listing", undefined, ctx), path).toThrow();
        }
      }

      // Rutas del conjunto: true si no están bloqueadas; false en caso contrario.
      for (const s of valid) {
        const path = `/${s}`;
        const blocked = adapter.isBlockedPath(path, "listing");
        expect(discovery.isSecondaryPagePath(path), path).toBe(!blocked);
        if (blocked) {
          expect(() => validateAcquisitionUrl(adapter, `${ORIGIN}${path}`, "listing", undefined, ctx), path).toThrow();
        } else {
          expect(() => validateAcquisitionUrl(adapter, `${ORIGIN}${path}`, "listing", undefined, ctx), path).not.toThrow();
        }
      }
      // Filas inconsistentes quedan fuera del conjunto.
      for (const b of bad) expect(index.allowedPaths().has(`/${b.source_slug}`)).toBe(false);
    });
  });

  // Feature: puntoticket-venue-discovery, Property 12: URLs derivadas de venue_sources son canónicas y la allowlist es el conjunto de slugs
  // **Validates: Requirements 11.5, 12.1, 12.2, 12.8**
  it("Propiedad 12: source_url canónica y allowlist = conjunto de source_slug", async () => {
    await runIterations(ITERATIONS, BASE_SEED, async (prng) => {
      const n = prng.int(0, 15);
      const rows: VenueSourceRow[] = [];
      for (let k = 0; k < n; k++) {
        // Con probabilidad 0.2 repite un slug ya presente (filas duplicadas).
        const s = rows.length > 0 && prng.bool(0.2) ? prng.pick(rows).source_slug : slug(prng);
        rows.push({ source_slug: s, source_url: `https://www.puntoticket.com/${s}` });
      }
      const slugs = new Set(rows.map((r) => r.source_slug));

      const index = createDbVenuesIndex(async () => rows);
      const urls = await index.list({} as never);

      expect(index.rejectedRows()).toEqual([]);
      for (const url of urls) expect(canonicalSourceUrl(url, "venue_url")).toBe(url);
      expect(new Set(urls)).toEqual(new Set([...slugs].map((s) => `https://www.puntoticket.com/${s}`)));
      expect(urls.length).toBe(slugs.size);
      expect(index.allowedPaths()).toEqual(new Set([...slugs].map((s) => `/${s}`)));
    });
  });
});
