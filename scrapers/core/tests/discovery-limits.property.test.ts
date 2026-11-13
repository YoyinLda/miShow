import { describe, expect, it } from "vitest";
import { resolveDiscoveryLimits } from "../src/acquisition/discovery.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const BASE_SEED = 0x14_0d15c;
const ITERATIONS = 150;
const MAX = "PUNTOTICKET_MAX_VENUE_PAGES";
const LIMIT = "PUNTOTICKET_MAX_VENUE_PAGES_LIMIT";

function defaultsOf(prng: Prng): { maxEvents: number; maxEventsLimit: number } {
  const maxEvents = prng.int(0, 60);
  return { maxEvents, maxEventsLimit: maxEvents + prng.int(0, 60) };
}

function invalidValue(prng: Prng): string {
  const n = prng.int(1, 999);
  return prng.pick([`-${n}`, `${n}.5`, `${n}.0`, `abc`, `${n}x`, `1e3`, `+${n}`, `0x1f`, `NaN`, `99999999999999999999`]);
}

// Feature: puntoticket-venue-discovery, Property 14: Resolución de topes configurables
describe("Propiedad 14: resolución de topes configurables", () => {
  it("sin variables (o vacías) usa los defaults", async () => {
    await runIterations(ITERATIONS, BASE_SEED, (prng) => {
      const d = defaultsOf(prng);
      const env = prng.bool() ? {} : { [MAX]: prng.pick(["", "  "]), [LIMIT]: prng.pick(["", " "]) };
      expect(resolveDiscoveryLimits(env, d)).toEqual({ maxPages: d.maxEvents, maxPagesLimit: d.maxEventsLimit });
    });
  });

  it("valores válidos se devuelven tal cual y el efectivo es min(maxPages, maxPagesLimit)", async () => {
    await runIterations(ITERATIONS, BASE_SEED + 1000, (prng) => {
      const d = defaultsOf(prng);
      const limit = prng.int(0, 200);
      const max = prng.int(0, limit);
      const pad = prng.bool() ? " " : "";
      const r = resolveDiscoveryLimits({ [MAX]: `${pad}${max}${pad}`, [LIMIT]: String(limit) }, d);
      expect(r).toEqual({ maxPages: max, maxPagesLimit: limit });
      expect(Math.min(r.maxPages, r.maxPagesLimit)).toBe(max);
      expect(Math.min(r.maxPages, r.maxPagesLimit)).toBeLessThanOrEqual(limit);
    });
  });

  it("una sola variable definida completa la otra con su default", async () => {
    await runIterations(ITERATIONS, BASE_SEED + 2000, (prng) => {
      const d = defaultsOf(prng);
      const max = prng.int(0, d.maxEventsLimit);
      expect(resolveDiscoveryLimits({ [MAX]: String(max) }, d)).toEqual({ maxPages: max, maxPagesLimit: d.maxEventsLimit });
      const limit = prng.int(d.maxEvents, d.maxEvents + 100);
      expect(resolveDiscoveryLimits({ [LIMIT]: String(limit) }, d)).toEqual({ maxPages: d.maxEvents, maxPagesLimit: limit });
    });
  });

  it("rechaza valores no enteros o negativos en cualquiera de las variables", async () => {
    await runIterations(ITERATIONS, BASE_SEED + 3000, (prng) => {
      const d = defaultsOf(prng);
      const name = prng.pick([MAX, LIMIT]);
      expect(() => resolveDiscoveryLimits({ [name]: invalidValue(prng) }, d)).toThrow(name);
    });
  });

  it("rechaza maxPages > maxPagesLimit", async () => {
    await runIterations(ITERATIONS, BASE_SEED + 4000, (prng) => {
      const d = defaultsOf(prng);
      const limit = prng.int(0, 100);
      const max = limit + prng.int(1, 100);
      expect(() => resolveDiscoveryLimits({ [MAX]: String(max), [LIMIT]: String(limit) }, d)).toThrow(/no puede superar/);
    });
  });
});
