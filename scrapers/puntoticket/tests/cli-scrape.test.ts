import { describe, expect, it } from "vitest";
import type { EventPersistence, FinishRunInput, HttpTransport } from "@mishow/scraper-core";
import { executePersistedPuntoTicketScrape } from "../src/persistence/workflow.js";
import { PuntoTicketHttpClient } from "../src/acquisition/http.js";
import { scrapePuntoTicket } from "../src/acquisition/orchestrator.js";
import { createPuntoticketAdapter } from "../src/adapter.js";
import { createFixedListSource } from "../src/discovery/fixed-list.js";
import { CliUsageError, parseConfig, parseDiscovery, resolveVenueDiscoveryEnabled } from "../src/cli/scrape-args.js";
import { buildScrape } from "../src/cli/scrape-run.js";

const ORIGIN = "https://www.puntoticket.com";
const VENUE = `${ORIGIN}/recintos/teatro-a`;
const NOW = () => new Date("2026-09-08T12:00:00.000Z");
const html = { "content-type": "text/html; charset=utf-8" };

const musica = `<article class="filtr-item event-item"><a href="/evento/M1"><h3>M1</h3></a></article>`;
const venuePage = `<article class="filtr-item event-item"><a href="/evento/V1"><h3>V1</h3></a></article>`;
const detail = (name: string) =>
  `<h1>${name}</h1><script type="application/ld+json">{"@type":"Event","name":"${name}","startDate":"2026-12-12T20:00:00-03:00","offers":{"url":"/queue/enqueue/X","availability":"https://schema.org/InStock"}}</script>`;

function transportWith(calls: string[]): HttpTransport {
  return async (req) => {
    calls.push(req.url);
    if (req.url.endsWith("/musica")) return { status: 200, body: musica, headers: html };
    if (req.url === VENUE) return { status: 200, body: venuePage, headers: html };
    return { status: 200, body: detail(req.url.split("/").pop() ?? "E"), headers: html };
  };
}

const sleep = async () => undefined;

describe("CLI puntoticket-scrape", () => {
  it("sin --venue-discovery la salida es idéntica al scrape base y sin clave discovery", async () => {
    const calls: string[] = [];
    const { scrape } = buildScrape(["--live"], {}, { transport: transportWith(calls), now: NOW, sleep });
    const actual = await scrape();

    const baseClient = new PuntoTicketHttpClient({ transport: transportWith([]), sleep });
    const expected = await scrapePuntoTicket({ client: baseClient, now: NOW });

    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
    expect("discovery" in actual).toBe(false);
    expect(calls).not.toContain(VENUE);
  });

  it("sin el flag, --venue-url y PUNTOTICKET_VENUE_URLS se ignoran", () => {
    expect(parseDiscovery(["--live", "--venue-url", VENUE], { PUNTOTICKET_VENUE_URLS: VENUE })).toEqual({});
  });

  it("con --venue-discovery incluye discovery y el cliente acepta páginas de venue", async () => {
    const calls: string[] = [];
    const { scrape } = buildScrape(
      ["--live", "--venue-discovery", "--venue-url", VENUE, "--max-venue-pages", "3"],
      {},
      { transport: transportWith(calls), now: NOW, sleep }
    );
    const result = await scrape();
    expect(calls).toContain(VENUE);
    expect(result.discovery).toBeDefined();
    expect(result.errors.filter((e) => /no permitido/i.test(e.message))).toEqual([]);
    expect(result.events.length).toBeGreaterThanOrEqual(2);
  });

  it("con --persist el reporte de discovery llega a finishRun y se mantiene en el resultado", async () => {
    const finished: FinishRunInput[] = [];
    const persistence: EventPersistence = {
      async startRun() { return { run_id: "7", status: "running" }; },
      async persistEvent() { return { event_id: "1", warnings: [] }; },
      async recordError() { return undefined; },
      async finishRun(_id, input) { finished.push(input); }
    } as EventPersistence;
    const { scrape } = buildScrape(
      ["--live", "--venue-discovery", "--venue-url", VENUE],
      {},
      { transport: transportWith([]), now: NOW, sleep }
    );
    const result = await executePersistedPuntoTicketScrape({
      persistence,
      start: { source: "puntoticket", listing_url: `${ORIGIN}/musica`, started_at: NOW().toISOString(), parameters: {} },
      scrape,
      now: NOW
    });
    expect(result.discovery).toBeDefined();
    expect(finished[0]?.discovery_report).toEqual(result.discovery);
  });

  it("PuntoTicketHttpClient con adapter base rechaza venue; con adapter de discovery lo permite", async () => {
    const adapter = createPuntoticketAdapter({ venueIndex: createFixedListSource([VENUE]) });
    const base = new PuntoTicketHttpClient({ transport: transportWith([]), sleep });
    const withDiscovery = new PuntoTicketHttpClient({ transport: transportWith([]), sleep, adapter });
    await expect(base.getHtml(VENUE, "listing", { secondaryListing: true })).rejects.toThrow();
    await expect(withDiscovery.getHtml(VENUE, "listing", { secondaryListing: true })).resolves.toBeDefined();
  });

  it("--max-venue-pages se valida (1..tope por entorno, entero)", () => {
    const base = ["--live", "--venue-discovery", "--max-venue-pages"];
    const env = { PUNTOTICKET_MAX_VENUE_PAGES: "10", PUNTOTICKET_MAX_VENUE_PAGES_LIMIT: "25" };
    const deps = { venueSourcesLoader: async () => [] };
    for (const bad of ["0", "26", "abc", "-1"]) {
      expect(() => parseDiscovery([...base, bad], env, deps)).toThrow(CliUsageError);
    }
    expect(() => parseDiscovery(base, env, deps)).toThrow(CliUsageError);
    expect(parseDiscovery([...base, "25"], env, deps).discovery).toEqual({ enabled: true, maxPages: 25, maxPagesLimit: 25 });
    expect(parseDiscovery(["--venue-discovery"], env, { venueSourcesLoader: async () => [] }).discovery).toEqual({ enabled: true, maxPages: 10, maxPagesLimit: 25 });
    expect(() => parseDiscovery(["--venue-discovery"], { PUNTOTICKET_MAX_VENUE_PAGES: "x" }, { venueSourcesLoader: async () => [] })).toThrow(CliUsageError);
  });

  it("resolveVenueDiscoveryEnabled: flag o env true; false/ausente no; otro valor falla", () => {
    expect(resolveVenueDiscoveryEnabled({}, false)).toBe(false);
    expect(resolveVenueDiscoveryEnabled({ PUNTOTICKET_VENUE_DISCOVERY: "false" }, false)).toBe(false);
    expect(resolveVenueDiscoveryEnabled({ PUNTOTICKET_VENUE_DISCOVERY: "true" }, false)).toBe(true);
    expect(resolveVenueDiscoveryEnabled({}, true)).toBe(true);
    expect(resolveVenueDiscoveryEnabled({ PUNTOTICKET_VENUE_DISCOVERY: "false" }, true)).toBe(true);
    for (const bad of ["1", "TRUE", "yes", ""]) {
      expect(() => resolveVenueDiscoveryEnabled({ PUNTOTICKET_VENUE_DISCOVERY: bad }, false)).toThrow(CliUsageError);
    }
  });

  it("habilitado por env usa db-venues con loader inyectado; sin Supabase ni lista falla con error de uso", () => {
    const env = { PUNTOTICKET_VENUE_DISCOVERY: "true" };
    const parsed = parseDiscovery(["--live"], env, { venueSourcesLoader: async () => [] });
    expect(parsed.discovery?.enabled).toBe(true);
    expect(parsed.adapter?.discovery?.index.kind).toBe("db-venues");
    expect(() => parseDiscovery(["--live"], env)).toThrow(CliUsageError);
    const fixed = parseDiscovery(["--live", "--venue-url", VENUE], env);
    expect(fixed.adapter?.discovery?.index.kind).toBe("fixed-list");
  });

  it("parseConfig no rechaza los flags de discovery", () => {
    expect(() => parseConfig(["--live", "--venue-discovery", "--venue-url", VENUE, "--max-venue-pages", "2"])).not.toThrow();
  });
});
