import { describe, expect, it } from "vitest";
import type { RawEventReference } from "@mishow/domain";
import type { SecondaryDiscovery, SourceAdapter } from "../src/adapter.js";
import { HttpClient, type HttpTransport } from "../src/acquisition/http.js";
import { scrape, type ScrapeResult } from "../src/acquisition/orchestrator.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const HOST = "www.puntoticket.com";
const BASE_SEED = 0x5eed07;
const ITERATIONS = 120;
const NOW = new Date("2025-01-01T00:00:00.000Z");

function makeAdapter(withDiscovery: boolean, indexUrls: string[] = []): SourceAdapter {
  const discovery: SecondaryDiscovery = {
    id: "venues",
    isSecondaryPagePath: (p) => p.startsWith("/venues/"),
    index: { kind: "fixed-list", list: async () => indexUrls },
    parsePage: () => []
  };
  const adapter: SourceAdapter = {
    source: "puntoticket",
    name: "PuntoTicket",
    baseUrl: `https://${HOST}`,
    host: HOST,
    listingUrl: `https://${HOST}/musica`,
    purchasePathPatterns: [/^\/comprar(\/|$)/i],
    ...(withDiscovery ? { discovery } : {}),
    isListingPath: (p) => p === "/musica",
    isDetailPath: (p) => p.startsWith("/evento/"),
    isBlockedPath: (p) => p.startsWith("/comprar"),
    parseListing: (html, baseUrl) =>
      html
        .split("\n")
        .filter((line) => line.startsWith("href="))
        .map((line): RawEventReference => ({ source_url: new URL(line.slice(5), baseUrl).href })),
    parseDetail: () => ({ errors: [] }),
    extractDetail: () => ({ errors: [] })
  };
  return adapter;
}

interface Scenario {
  listingHtml: string;
  paths: string[];
  failing: Set<string>;
  maxEvents: number;
}

function genScenario(prng: Prng): Scenario {
  const count = prng.int(0, 12);
  const paths: string[] = [];
  for (let k = 0; k < count; k++) {
    paths.push(prng.bool(0.8) ? `/evento/ev-${k}` : `/otra/x-${k}`);
  }
  const failing = new Set(paths.filter(() => prng.bool(0.25)).map((p) => `https://${HOST}${p}`));
  return {
    listingHtml: paths.map((p) => `href=${p}`).join("\n"),
    paths,
    failing,
    maxEvents: prng.int(0, 15)
  };
}

async function run(
  scenario: Scenario,
  adapter: SourceAdapter,
  discovery?: { enabled: boolean; maxPages: number; maxPagesLimit: number }
): Promise<{ result: ScrapeResult; requests: string[] }> {
  const requests: string[] = [];
  const transport: HttpTransport = async ({ url }) => {
    requests.push(url);
    if (scenario.failing.has(url)) return { status: 404, headers: { "content-type": "text/html" }, body: "" };
    return { status: 200, headers: { "content-type": "text/html" }, body: url.endsWith("/musica") ? scenario.listingHtml : "<html></html>" };
  };
  const config = { maxEvents: scenario.maxEvents };
  const client = new HttpClient({ adapter, config, transport, sleep: async () => undefined, nowMs: () => 0 });
  const result = await scrape({ adapter, config, client, now: () => NOW, ...(discovery ? { discovery } : {}) });
  return { result, requests };
}

describe("orchestrator preserve (propiedad)", () => {
  // Feature: puntoticket-venue-discovery, Property 7: Preservación del comportamiento sin descubrimiento
  it("Property 7: Preservación del comportamiento sin descubrimiento", async () => {
    // Validates: Requirements 1.6, 2.1, 2.4, 10.2
    await runIterations(ITERATIONS, BASE_SEED, async (prng) => {
      const scenario = genScenario(prng);
      const withDisc = makeAdapter(true, []);
      const plain = makeAdapter(false);

      const baseline = await run(scenario, plain);
      const variants = [
        await run(scenario, withDisc),
        await run(scenario, withDisc, { enabled: false, maxPages: prng.int(0, 25), maxPagesLimit: 25 }),
        await run(scenario, plain, { enabled: true, maxPages: prng.int(0, 25), maxPagesLimit: 25 }),
        await run(scenario, plain, { enabled: false, maxPages: 10, maxPagesLimit: 25 })
      ];

      expect("discovery" in baseline.result).toBe(false);
      for (const v of variants) {
        expect("discovery" in v.result).toBe(false);
        expect(v.result).toEqual(baseline.result);
        expect(v.requests).toEqual(baseline.requests);
      }

      // Discovery habilitado con índice de 0 páginas: mismas referencias de /musica.
      const enabled = await run(scenario, withDisc, { enabled: true, maxPages: prng.int(1, 25), maxPagesLimit: 25 });
      expect(enabled.requests).toEqual(baseline.requests);
      expect(enabled.result.events).toEqual(baseline.result.events);
      expect(enabled.result.errors).toEqual(baseline.result.errors);
      expect(enabled.result.summary).toEqual(baseline.result.summary);
      const report = enabled.result.discovery;
      expect(report).toBeDefined();
      expect(report?.missing_count).toBe(0);
      expect(report?.venue_pages).toEqual({ requested: 0, succeeded: 0, failed: 0 });
      expect(report?.musica_unique).toBe(scenario.paths.length);
    });
  });
});
