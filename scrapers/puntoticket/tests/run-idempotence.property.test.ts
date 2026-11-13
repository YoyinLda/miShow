import { describe, expect, it } from "vitest";
import { HttpClient, type EventPersistence, type HttpTransport } from "@mishow/scraper-core";
import type { NormalizedEvent } from "@mishow/domain";
import { createPuntoticketAdapter } from "../src/adapter.js";
import { createFixedListSource } from "../src/discovery/fixed-list.js";
import { scrapePuntoTicket } from "../src/acquisition/orchestrator.js";
import { executePersistedPuntoTicketScrape } from "../src/persistence/workflow.js";
import { runIterations, type Prng } from "./helpers/prng.js";

const ORIGIN = "https://www.puntoticket.com";
const NOW = new Date("2026-09-08T12:00:00.000Z");

/** Persistencia en memoria con clave (source, source_url): upsert idempotente. */
function memoryPersistence(store: Map<string, NormalizedEvent>, writes: { count: number }): EventPersistence {
  return {
    async startRun() {
      return { run_id: "1", status: "running" };
    },
    async persistEvent(_runId, event) {
      writes.count += 1;
      store.set(`${event.source}|${event.source_url}`, structuredClone(event));
      return { event_id: String(store.size), warnings: [] };
    },
    async recordError() {},
    async finishRun() {}
  };
}

function detailHtml(slug: string, day: number): string {
  const date = `2026-12-${String(day).padStart(2, "0")}T20:00:00-03:00`;
  return `<h1>Evento ${slug}</h1><script type="application/ld+json">{"@type":"Event","name":"Evento ${slug}","startDate":"${date}","offers":{"url":"/queue/enqueue/${slug}","availability":"https://schema.org/InStock"}}</script>`;
}

function cards(slugs: string[]): string {
  return slugs.map((s) => `<article class="filtr-item event-item"><a href="/evento/${s}"><h3>Evento ${s}</h3></a></article>`).join("");
}

function html(body: string): { status: number; body: string; headers: Record<string, string> } {
  return { status: 200, body, headers: { "content-type": "text/html; charset=utf-8" } };
}

interface World {
  days: Map<string, number>;
  listing: string[];
  venues: string[][];
}

function subset(prng: Prng, all: string[], p: number): string[] {
  return all.filter(() => prng.bool(p));
}

function genWorld(prng: Prng): World {
  const total = prng.int(1, 8);
  const slugs = Array.from({ length: total }, (_, i) => `e${i}x${prng.int(100, 999)}`);
  const days = new Map(slugs.map((s) => [s, prng.int(1, 28)]));
  const venueCount = prng.int(1, 3);
  const listing = subset(prng, slugs, 0.6);
  const venues = Array.from({ length: venueCount }, () => subset(prng, slugs, 0.5));
  // Todo evento aparece en al menos una vía; con prob. alta se fuerza solape listado+venue.
  for (const s of slugs) {
    if (!listing.includes(s) && !venues.some((v) => v.includes(s))) listing.push(s);
    if (prng.bool(0.4)) {
      if (!listing.includes(s)) listing.push(s);
      const v = venues[prng.int(0, venueCount - 1)];
      if (!v.includes(s)) v.push(s);
    }
  }
  return { days, listing, venues };
}

function makeRun(world: World, listing: string[], venues: string[][] | null, store: Map<string, NormalizedEvent>, writes: { count: number }) {
  const venueUrls = (venues ?? []).map((_, i) => `${ORIGIN}/recintos/v${i}`);
  const adapter = createPuntoticketAdapter(venues ? { venueIndex: createFixedListSource(venueUrls) } : undefined);
  const transport: HttpTransport = async (req) => {
    if (req.url === `${ORIGIN}/musica`) return html(cards(listing));
    const venue = /\/recintos\/v(\d+)$/.exec(req.url);
    if (venue && venues) return html(cards(venues[Number(venue[1])]));
    const detail = /\/evento\/([A-Za-z0-9-]+)$/.exec(req.url);
    if (detail && world.days.has(detail[1])) return html(detailHtml(detail[1], world.days.get(detail[1])!));
    throw new Error(`unexpected ${req.url}`);
  };
  const client = new HttpClient({ adapter, transport, sleep: async () => undefined });
  const persistence = memoryPersistence(store, writes);
  return () =>
    executePersistedPuntoTicketScrape({
      persistence,
      start: { source: "puntoticket", listing_url: `${ORIGIN}/musica`, started_at: NOW.toISOString(), parameters: {} },
      scrape: () =>
        scrapePuntoTicket({
          adapter,
          client,
          now: () => NOW,
          ...(venues ? { discovery: { enabled: true, maxPages: 10, maxPagesLimit: 25 } } : {})
        }),
      now: () => NOW
    });
}

describe("Feature: puntoticket-venue-discovery — idempotencia de la corrida", () => {
  it("Property 8: dos corridas == una; evento por ambas vías se persiste una vez e igual (≥100 iteraciones)", async () => {
    // Feature: puntoticket-venue-discovery, Property 8: Idempotencia de la corrida
    // **Validates: Requirements 4.2, 4.3, 4.4, 4.6, 6.1, 6.2**
    await runIterations(120, 20260708, async (prng) => {
      const world = genWorld(prng);
      const all = [...world.days.keys()];

      // Una corrida combinada (listado + venues).
      const once = new Map<string, NormalizedEvent>();
      await makeRun(world, world.listing, world.venues, once, { count: 0 })();

      // Dos corridas sobre la misma persistencia.
      const twice = new Map<string, NormalizedEvent>();
      const writes = { count: 0 };
      const run = makeRun(world, world.listing, world.venues, twice, writes);
      await run();
      const afterFirst = new Map(twice);
      await run();

      expect(twice.size).toBe(all.length);
      expect([...twice.keys()].sort()).toEqual([...once.keys()].sort());
      expect(twice).toEqual(afterFirst);
      expect(twice).toEqual(once);

      // Referencia: todos los eventos descubiertos solo por el listado (sin venues).
      const viaListing = new Map<string, NormalizedEvent>();
      await makeRun(world, all, null, viaListing, { count: 0 })();
      // Solo por venues (listado vacío).
      const viaVenue = new Map<string, NormalizedEvent>();
      await makeRun(world, [], [all], viaVenue, { count: 0 })();

      // Cada evento, sin importar la vía, persiste una vez con NormalizedEvent igual.
      expect(once).toEqual(viaListing);
      expect(once).toEqual(viaVenue);
    });
  });
});
