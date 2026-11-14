import { describe, expect, it } from "vitest";
import type { RawEventReference } from "@mishow/domain";
import type { SecondaryDiscovery, SourceAdapter } from "../src/adapter.js";
import { classifyMerged, type MergedReference } from "../src/acquisition/discovery.js";
import { HttpClient, type HttpTransport } from "../src/acquisition/http.js";
import { scrape } from "../src/acquisition/orchestrator.js";
import { validateAcquisitionUrl } from "../src/acquisition/policy.js";
import { mapEventForPersistence } from "../src/persistence/mapping.js";

// Brief 007: clasificación de eventos descubiertos solo por venue.

const HOST = "www.puntoticket.com";
const url = (slug: string) => `https://${HOST}/evento/${slug}`;
const merged = (slug: string, origins: MergedReference["origins"]): MergedReference => ({
  reference: { source_url: url(slug) },
  origins,
  venue_pages: []
});

describe("classifyMerged", () => {
  const items = [
    merged("concierto", ["musica"]),
    merged("musica-y-deporte", ["musica", "venue"]),
    merged("partido", ["venue"]),
    merged("tocata-venue", ["venue"])
  ];
  const listed = new Map([
    [url("partido"), "deportes"],
    [url("musica-y-deporte"), "deportes"]
  ]);

  it("la música gana; venue-only listado toma su categoría; el resto es música", () => {
    const result = classifyMerged(items, listed, true);
    expect(result.get(url("concierto"))).toBe("musica");
    expect(result.get(url("musica-y-deporte"))).toBe("musica");
    expect(result.get(url("partido"))).toBe("deportes");
    expect(result.get(url("tocata-venue"))).toBe("musica");
  });

  it("si un listado falló, el venue-only no listado queda sin clasificar", () => {
    const result = classifyMerged(items, listed, false);
    expect(result.get(url("partido"))).toBe("deportes");
    expect(result.has(url("tocata-venue"))).toBe(false);
  });
});

function makeAdapter(venueRefs: string[]): SourceAdapter {
  const discovery: SecondaryDiscovery = {
    id: "venues",
    isSecondaryPagePath: (p) => p === "/estadio-x",
    index: { kind: "fixed-list", list: async () => [`https://${HOST}/estadio-x`] },
    parsePage: () => venueRefs.map((slug): RawEventReference => ({ source_url: url(slug) })),
    categoryListings: [{ category: "deportes", url: `https://${HOST}/deportes` }]
  };
  return {
    source: "puntoticket",
    name: "PuntoTicket",
    baseUrl: `https://${HOST}`,
    host: HOST,
    listingUrl: `https://${HOST}/musica`,
    purchasePathPatterns: [/^\/comprar(\/|$)/i],
    discovery,
    isListingPath: (p) => p === "/musica",
    isDetailPath: (p) => p.startsWith("/evento/"),
    isBlockedPath: () => false,
    parseListing: (html, baseUrl) =>
      html.split("\n").filter(Boolean).map((slug): RawEventReference => ({ source_url: new URL(`/evento/${slug}`, baseUrl).href })),
    parseDetail: () => ({ errors: [] }),
    extractDetail: () => ({ errors: [] })
  };
}

async function run(adapter: SourceAdapter, pages: Record<string, { status: number; body: string }>) {
  const requests: string[] = [];
  const transport: HttpTransport = async ({ url: requested }) => {
    requests.push(requested);
    const page = pages[new URL(requested).pathname] ?? { status: 200, body: "" };
    return { status: page.status, headers: { "content-type": "text/html" }, body: page.body };
  };
  const config = { maxEvents: 10 };
  const client = new HttpClient({ adapter, config, transport, sleep: async () => undefined, nowMs: () => 0 });
  const result = await scrape({
    adapter,
    config,
    client,
    now: () => new Date("2026-11-14T00:00:00Z"),
    discovery: { enabled: true, maxPages: 5, maxPagesLimit: 5 }
  });
  return { result, requests };
}

describe("orquestador: listados de categoría", () => {
  it("lee /deportes solo si hay eventos que llegaron únicamente por venue", async () => {
    const onlyMusic = await run(makeAdapter(["concierto"]), { "/musica": { status: 200, body: "concierto" } });
    expect(onlyMusic.requests.some((r) => r.endsWith("/deportes"))).toBe(false);

    const withVenueOnly = await run(makeAdapter(["partido"]), {
      "/musica": { status: 200, body: "concierto" },
      "/deportes": { status: 200, body: "partido" }
    });
    expect(withVenueOnly.requests.some((r) => r.endsWith("/deportes"))).toBe(true);
    expect(withVenueOnly.result.errors.filter((e) => e.code === "category_listing_failed")).toHaveLength(0);
  });

  it("un listado de categoría caído se registra como error sin romper la corrida", async () => {
    const { result } = await run(makeAdapter(["partido"]), {
      "/musica": { status: 200, body: "concierto" },
      "/deportes": { status: 404, body: "" }
    });
    expect(result.errors.some((e) => e.code === "category_listing_failed" && e.stage === "listing")).toBe(true);
    expect(result.summary.discovered).toBe(2);
  });
});

describe("política: listados de categoría", () => {
  const adapter = makeAdapter([]);
  it("solo se permiten marcados como categoryListing y declarados", () => {
    expect(validateAcquisitionUrl(adapter, `https://${HOST}/deportes`, "listing", undefined, { categoryListing: true })).toBe(`https://${HOST}/deportes`);
    expect(() => validateAcquisitionUrl(adapter, `https://${HOST}/deportes`, "listing")).toThrow();
    expect(() => validateAcquisitionUrl(adapter, `https://${HOST}/teatro`, "listing", undefined, { categoryListing: true })).toThrow();
  });
});

describe("persistencia: category", () => {
  const adapter = makeAdapter([]);
  const base = {
    source: "puntoticket",
    source_url: url("partido"),
    extracted_at: "2026-11-14T00:00:00Z",
    name: "Club A vs Club B",
    artists: [],
    performances: [],
    status: "available" as const
  };
  it("envía category cuando existe y la omite si no", () => {
    expect(mapEventForPersistence(adapter, { ...base, category: "deportes" }).category).toBe("deportes");
    expect("category" in mapEventForPersistence(adapter, base)).toBe(false);
  });
  it("rechaza categorías mal formadas", () => {
    expect(() => mapEventForPersistence(adapter, { ...base, category: "Deportes!" })).toThrow();
  });
});
