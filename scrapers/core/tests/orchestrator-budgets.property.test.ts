import { describe, expect, it } from "vitest";
import type { RawEventReference } from "@mishow/domain";
import type { SourceAdapter } from "../src/adapter.js";
import { HttpClient, type HttpTransport } from "../src/acquisition/http.js";
import { scrape } from "../src/acquisition/orchestrator.js";
import { acquisitionDefaults } from "../src/acquisition/policy.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const HOST = "www.example.com";
const BASE_SEED = 0x5eed10;
const ITERATIONS = 120;

interface Scenario {
  adapter: SourceAdapter;
  musica: RawEventReference[];
  indexSize: number;
}

const eventUrl = (n: number): string => `https://${HOST}/evento/e${n}`;
const venueUrl = (n: number): string => `https://${HOST}/venues/v${n}`;

/** Adapter falso: el índice devuelve `indexSize` venues (con duplicados) y cada página N refs aleatorias. */
function buildScenario(prng: Prng): Scenario {
  const indexSize = prng.int(0, 60);
  const poolSize = prng.int(1, 400);
  const musica: RawEventReference[] = Array.from({ length: prng.int(0, 250) }, () => ({ source_url: eventUrl(prng.int(0, poolSize)) }));
  const perPage = new Map<string, RawEventReference[]>();
  for (let i = 0; i < indexSize; i++) {
    perPage.set(
      venueUrl(i),
      Array.from({ length: prng.int(0, 80) }, () => ({ source_url: eventUrl(prng.int(0, poolSize)) }))
    );
  }
  const candidates: string[] = [];
  for (let i = 0; i < indexSize; i++) {
    candidates.push(venueUrl(i));
    if (prng.bool(0.2)) candidates.push(venueUrl(i)); // duplicado en el índice
  }
  const adapter = {
    source: "example",
    name: "Example",
    baseUrl: `https://${HOST}`,
    host: HOST,
    listingUrl: `https://${HOST}/musica`,
    purchasePathPatterns: [],
    discovery: {
      id: "venues",
      isSecondaryPagePath: (p: string) => /^\/venues\/v\d+$/.test(p),
      index: { kind: "fixed-list", list: async () => candidates },
      parsePage: (_html: string, pageUrl: string) => perPage.get(pageUrl) ?? []
    },
    isListingPath: (p: string) => p === "/musica",
    isDetailPath: (p: string) => p.startsWith("/evento/"),
    isBlockedPath: () => false,
    parseListing: () => musica,
    parseDetail: () => ({ errors: [] }),
    extractDetail: () => ({ errors: [] })
  } as unknown as SourceAdapter;
  return { adapter, musica, indexSize };
}

const PAGES_LIMIT = 25;

describe("Orquestador: presupuestos de solicitudes", () => {
  it("Propiedad 10: páginas de venue ≤ min(maxPages, tope) y detalles ≤ min(maxEvents, maxEventsLimit)", async () => {
    // Feature: puntoticket-venue-discovery, Property 10: Presupuestos de solicitudes
    // Validates: Requirements 5.8, 5.9
    let sawVenueCap = false;
    let sawDetailCap = false;
    await runIterations(ITERATIONS, BASE_SEED, async (prng) => {
      const { adapter, indexSize } = buildScenario(prng);
      const limit = acquisitionDefaults(adapter).maxEventsLimit;
      const maxPages = prng.int(0, PAGES_LIMIT + 15);
      const maxEvents = prng.int(0, limit);

      let venueRequests = 0;
      let detailRequests = 0;
      const transport: HttpTransport = async ({ url }) => {
        const path = new URL(url).pathname;
        if (path.startsWith("/venues/")) venueRequests += 1;
        else if (path.startsWith("/evento/")) detailRequests += 1;
        return { status: path.startsWith("/evento/") ? 404 : 200, headers: { "content-type": "text/html" }, body: "<html></html>" };
      };
      const client = new HttpClient({ adapter, config: { retries: 0 }, transport, sleep: async () => undefined });

      await scrape({
        adapter,
        config: { maxEvents, concurrency: 2, retries: 0 },
        client,
        now: () => new Date("2025-01-01T00:00:00Z"),
        discovery: { enabled: true, maxPages, maxPagesLimit: PAGES_LIMIT }
      });

      const pageBudget = Math.min(maxPages, PAGES_LIMIT);
      const detailBudget = Math.min(maxEvents, limit);
      expect(venueRequests).toBeLessThanOrEqual(pageBudget);
      expect(detailRequests).toBeLessThanOrEqual(detailBudget);
      if (indexSize > pageBudget) sawVenueCap ||= venueRequests === pageBudget;
      if (detailRequests === detailBudget && detailBudget > 0) sawDetailCap = true;
    });
    // Los generadores deben ejercitar realmente el recorte en ambos presupuestos.
    expect(sawVenueCap).toBe(true);
    expect(sawDetailCap).toBe(true);
  });
});
