import { describe, expect, it } from "vitest";
import { CatalogClient, CatalogClientError, type CatalogEvent } from "../src/index.js";

const sampleRow: CatalogEvent = {
  id: 1,
  source: "puntoticket",
  source_url: "https://www.puntoticket.com/aof-coliseo",
  source_code: "CCO117",
  purchase_url: "https://www.puntoticket.com/queue/enqueue/CCO117",
  image_url: "https://static.ptocdn.net/images/eventos/cco117_rs.jpg",
  name: "Alexisonfire en Teatro Coliseo",
  status: "available",
  price_min: 43700,
  price_max: 57500,
  currency: "CLP",
  source_extracted_at: "2026-09-12T21:52:44.620Z",
  first_seen_at: "2026-09-12T21:49:42.829Z",
  last_seen_at: "2026-09-12T21:53:55.263Z",
  next_performance_at: "2026-11-27T00:00:00Z",
  artists: [{ name: "Alexisonfire" }],
  venue: { name: "Teatro Coliseo", city: "Santiago Centro" },
  performances: [
    { starts_at: "2026-11-26T21:00:00-03:00", timezone: "America/Santiago", status: "available", performance_code: "CCO117" }
  ]
};

function fetchSpy(body: unknown, capture: { url?: string; headers?: Headers } = {}) {
  const impl = (async (input: string, init?: RequestInit) => {
    capture.url = String(input);
    capture.headers = new Headers(init?.headers);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, capture };
}

describe("CatalogClient", () => {
  it("requires url and publishableKey", () => {
    expect(() => new CatalogClient({ url: "", publishableKey: "" })).toThrow(CatalogClientError);
  });

  it("lists events and maps the catalog row shape", async () => {
    const { impl, capture } = fetchSpy([sampleRow]);
    const client = new CatalogClient({ url: "https://project.supabase.co/", publishableKey: "sb_publishable_TEST" }, impl);
    const events = await client.listEvents({ limit: 20 });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Alexisonfire en Teatro Coliseo");
    expect(events[0].artists[0].name).toBe("Alexisonfire");
    expect(events[0].performances[0].timezone).toBe("America/Santiago");
    expect(capture.url).toContain("/rest/v1/catalog_events_v1");
    expect(capture.headers?.get("apikey")).toBe("sb_publishable_TEST");
  });

  it("applies a case-insensitive name search filter", async () => {
    const { impl, capture } = fetchSpy([]);
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    await client.listEvents({ search: "alexis" });
    expect(capture.url).toContain("name=ilike.");
    expect(decodeURIComponent(capture.url ?? "")).toContain("*alexis*");
  });

  it("returns a single event by id", async () => {
    const { impl, capture } = fetchSpy([sampleRow]);
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    const event = await client.getEvent(1);
    expect(event?.id).toBe(1);
    expect(capture.url).toContain("id=eq.1");
  });

  it("wraps API failures in CatalogClientError", async () => {
    const impl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    await expect(client.listEvents()).rejects.toBeInstanceOf(CatalogClientError);
  });
});
