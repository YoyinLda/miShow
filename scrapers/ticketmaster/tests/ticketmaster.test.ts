import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractDetail, parseEventDetail, dateFromDescription, imageFromMeta } from "../src/extraction/detail.js";
import { parseMusicListing } from "../src/extraction/listing.js";
import { normalizeEvent } from "../src/normalization.js";
import { scrapeTicketmaster } from "../src/acquisition/orchestrator.js";
import { TicketmasterHttpClient } from "../src/acquisition/http.js";
import { validateAcquisitionUrl, acquisitionConfig } from "../src/acquisition/policy.js";
import type { HttpTransport } from "../src/acquisition/http.js";

const listingFixture = readFileSync(new URL("./fixtures/ticketmaster-listing.html", import.meta.url), "utf8");
const detailStartDate = readFileSync(new URL("./fixtures/ticketmaster-detail-startdate.html", import.meta.url), "utf8");
const detailDescription = readFileSync(new URL("./fixtures/ticketmaster-detail-description.html", import.meta.url), "utf8");

describe("Ticketmaster listing parser", () => {
  it("resolves relative ../event/ routes, deduplicates and reads title/venue", () => {
    expect(parseMusicListing(listingFixture)).toEqual([
      { source_url: "https://www.ticketmaster.cl/event/lucybell-teatro-caupolican", title: "Lucybell" },
      { source_url: "https://www.ticketmaster.cl/event/los-bunkers-movistar-arena", title: "Los Bunkers" }
    ]);
  });

  it("only selects grid_element event cards, ignoring non-event links", () => {
    const references = parseMusicListing(listingFixture);
    expect(references.every((reference) => reference.source_url.includes("/event/"))).toBe(true);
    expect(references).toHaveLength(2);
  });

  it("falls back to image alt when item_title is absent", () => {
    const html = `<div class='grid_element'><a href='../event/foo'><img alt='Titulo desde alt'></a></div>`;
    expect(parseMusicListing(html)).toEqual([
      { source_url: "https://www.ticketmaster.cl/event/foo", title: "Titulo desde alt" }
    ]);
  });

  it("canonicalizes the base and rejects an external base host", () => {
    expect(parseMusicListing(`<div class='grid_element'><a href='../event/bar?ref=x#y'><span class='item_title'>Bar</span></a></div>`, "https://www.ticketmaster.cl/page/musica/?page=2")).toEqual([
      { source_url: "https://www.ticketmaster.cl/event/bar", title: "Bar" }
    ]);
    expect(() => parseMusicListing("<a href='/event/x'>x</a>", "https://evil.example/page/musica")).toThrow("base-url");
  });
});

describe("Ticketmaster detail extraction and normalization", () => {
  it("extracts JSON-LD with startDate and keeps buyable status unknown without a followable purchase URL", () => {
    const raw = parseEventDetail(detailStartDate, "https://www.ticketmaster.cl/event/lucybell-teatro-caupolican").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.name).toBe("Lucybell");
    expect(extracted.artists).toEqual(["Lucybell"]);
    expect(extracted.image_url).toBe("https://static.ticketmaster.cl/lucybell.jpg");
    expect(extracted.venue).toMatchObject({ name: "Teatro Caupolicán", address: "San Diego 850", city: "Santiago" });
    expect(extracted.price).toEqual({ min: 18000, max: 60000, currency: "CLP" });
    expect(extracted.performances).toEqual([{ date: "2026-11-15T21:00:00-03:00", status: "unknown" }]);

    const normalized = normalizeEvent(raw, extracted, { extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(normalized.source).toBe("ticketmaster");
    expect(normalized.source_url).toBe("https://www.ticketmaster.cl/event/lucybell-teatro-caupolican");
    expect(normalized).not.toHaveProperty("purchase_url");
    expect(normalized.performances).toEqual([
      { starts_at: "2026-11-15T21:00:00-03:00", timezone: "America/Santiago", status: "unknown" }
    ]);
    // Con hora real (startDate con componente horario), time_known queda ausente.
    expect(normalized.performances[0]).not.toHaveProperty("time_known");
    expect(normalized.status).toBe("unknown");
  });

  it("derives the date from the description when JSON-LD has no startDate", () => {
    const raw = parseEventDetail(detailDescription, "https://www.ticketmaster.cl/event/los-bunkers-movistar-arena").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.performances).toEqual([{ date: "2026-12-20", status: "unknown" }]);
    const normalized = normalizeEvent(raw, extracted, { extracted_at: "2026-09-08T12:00:00.000Z" });
    // La descripción no trae hora: date-only => hora desconocida (time_known:false),
    // sin inventar hora; la fecha se conserva en America/Santiago.
    expect(normalized.performances[0]).toMatchObject({ starts_at: "2026-12-20T00:00:00-03:00", timezone: "America/Santiago", time_known: false });
    expect(normalized.name).toBe("Los Bunkers");
    expect(normalized.venue).toMatchObject({ name: "Movistar Arena", city: "Santiago" });
  });

  it("uses og:image as fallback when JSON-LD has no image", () => {
    const raw = parseEventDetail(detailDescription, "https://www.ticketmaster.cl/event/los-bunkers-movistar-arena").value!;
    const extracted = extractDetail(raw).value!;
    expect(extracted.image_url).toBe("https://cdn.getcrowder.com/images/los-bunkers-640x640.jpg");
  });

  it("prefers the JSON-LD image over the meta fallback when both exist", () => {
    const raw = parseEventDetail(detailStartDate, "https://www.ticketmaster.cl/event/lucybell-teatro-caupolican").value!;
    expect(extractDetail(raw).value!.image_url).toBe("https://static.ticketmaster.cl/lucybell.jpg");
  });

  it("imageFromMeta reads og:image, twitter:image, and ignores absence", () => {
    expect(imageFromMeta(`<meta property="og:image" content="https://cdn.example/og.jpg">`)).toBe("https://cdn.example/og.jpg");
    expect(imageFromMeta(`<meta name="twitter:image" content="https://cdn.example/tw.jpg">`)).toBe("https://cdn.example/tw.jpg");
    expect(imageFromMeta(`<h1>sin meta</h1>`)).toBeUndefined();
  });

  it("parses Spanish 'DD de Mes YYYY' dates", () => {
    expect(dateFromDescription("Show el 5 de enero 2027 en Santiago")).toBe("2027-01-05");
    expect(dateFromDescription("1 de septiembre de 2026")).toBe("2026-09-01");
    expect(dateFromDescription("sin fecha reconocible")).toBeUndefined();
  });

  it("canonicalizes and requires a Ticketmaster source URL", () => {
    expect(parseEventDetail("<h1>x</h1>", "https://www.ticketmaster.cl/event/x/?ref=1#a").value?.source_url).toBe("https://www.ticketmaster.cl/event/x");
    expect(() => parseEventDetail("<h1>x</h1>", "https://evil.example/event/x")).toThrow("host exacto www.ticketmaster.cl");
  });
});

describe("Ticketmaster acquisition policy", () => {
  it("accepts the listing and canonical event details, rejecting other hosts and blocked routes", () => {
    expect(validateAcquisitionUrl("https://www.ticketmaster.cl/page/musica", "listing")).toBe("https://www.ticketmaster.cl/page/musica");
    expect(validateAcquisitionUrl("https://www.ticketmaster.cl/event/abc-123", "detail")).toBe("https://www.ticketmaster.cl/event/abc-123");
    for (const [url, stage] of [
      ["http://www.ticketmaster.cl/page/musica", "listing"],
      ["https://www.ticketmaster.cl.attacker.example/page/musica", "listing"],
      ["https://www.ticketmaster.cl/page/deportes", "detail"],
      ["https://www.ticketmaster.cl/account", "detail"]
    ] as const) {
      expect(() => validateAcquisitionUrl(url, stage)).toThrow();
    }
  });

  it("keeps configuration within the approved ranges", () => {
    expect(acquisitionConfig({ maxEvents: 10 })).toMatchObject({ maxEvents: 10, listingUrl: "https://www.ticketmaster.cl/page/musica" });
    expect(() => acquisitionConfig({ concurrency: 3 })).toThrow();
  });
});

describe("Ticketmaster scrape orchestrator", () => {
  it("scrapes listing and details reusing the common engine", async () => {
    const calls: string[] = [];
    const transport: HttpTransport = async (request) => {
      calls.push(request.url);
      if (request.url.endsWith("/page/musica")) return response(200, listingFixture);
      if (request.url.endsWith("/event/lucybell-teatro-caupolican")) return response(200, detailStartDate);
      if (request.url.endsWith("/event/los-bunkers-movistar-arena")) return response(200, detailDescription);
      throw new Error(`unexpected request ${request.url}`);
    };
    const client = new TicketmasterHttpClient({ transport, sleep: async () => undefined });
    const dates = [new Date("2026-09-08T12:00:00.000Z"), new Date("2026-09-08T12:00:10.000Z")];
    const result = await scrapeTicketmaster({ client, now: () => dates.shift() ?? new Date("2026-09-08T12:00:10.000Z") });

    expect(calls).toEqual([
      "https://www.ticketmaster.cl/page/musica",
      "https://www.ticketmaster.cl/event/lucybell-teatro-caupolican",
      "https://www.ticketmaster.cl/event/los-bunkers-movistar-arena"
    ]);
    expect(result.source).toBe("ticketmaster");
    expect(result.summary).toEqual({ discovered: 2, attempted: 2, succeeded: 2, failed: 0 });
    expect(result.events.map((event) => event.name)).toEqual(["Lucybell", "Los Bunkers"]);
    expect(result.events.every((event) => event.source === "ticketmaster")).toBe(true);
  });
});

function response(status: number, body: string, headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" }) {
  return { status, body, headers };
}
