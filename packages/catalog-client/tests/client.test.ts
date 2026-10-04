import { describe, expect, it } from "vitest";
import { CatalogClient, CatalogClientError, type CatalogEvent, type CatalogFreshness } from "../src/index.js";

const sampleRow: CatalogEvent = {
  id: 1,
  slug: "alexisonfire-en-teatro-coliseo",
  name: "Alexisonfire en Teatro Coliseo",
  category: "musica",
  subcategory: null,
  status: "available",
  image_url: "https://static.ptocdn.net/images/eventos/cco117_rs.jpg",
  needs_review: false,
  first_seen_at: "2026-09-12T21:49:42.829Z",
  last_seen_at: "2026-09-12T21:53:55.263Z",
  next_performance_at: "2026-11-27T00:00:00Z",
  next_performance_time_known: true,
  artists: [{ name: "Alexisonfire", slug: "alexisonfire" }],
  venue: { slug: "teatro-coliseo", name: "Teatro Coliseo", city: "Santiago Centro" },
  sources: [
    {
      source: "puntoticket",
      source_url: "https://www.puntoticket.com/aof-coliseo",
      purchase_url: "https://www.puntoticket.com/queue/enqueue/CCO117",
      status: "available",
      price_min: 43700,
      price_max: 57500,
      currency: "CLP"
    }
  ],
  performances: [
    { starts_at: "2026-11-26T21:00:00-03:00", timezone: "America/Santiago", status: "available", performance_code: "CCO117" }
  ]
};

function fetchSpy(
  body: unknown,
  capture: { url?: string; headers?: Headers; method?: string; body?: string } = {}
) {
  const impl = (async (input: string, init?: RequestInit) => {
    capture.url = String(input);
    capture.headers = new Headers(init?.headers);
    capture.method = init?.method;
    capture.body = init?.body ? String(init.body) : undefined;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, capture };
}

const sampleFreshness: CatalogFreshness = {
  source: "puntoticket",
  last_run_finished_at: "2026-09-13T12:34:00Z",
  last_run_status: "succeeded",
  discovered_count: 12,
  succeeded_count: 11
};

describe("CatalogClient", () => {
  it("requires url and publishableKey", () => {
    expect(() => new CatalogClient({ url: "", publishableKey: "" })).toThrow(CatalogClientError);
  });

  it("invokes the default global fetch without binding this to the client (no 'Illegal invocation')", async () => {
    // Reproduce el comportamiento del navegador: fetch exige this === globalThis.
    // Si el cliente llamara this.fetchImpl(...) con la referencia global desnuda,
    // aquí this sería el CatalogClient y lanzaríamos "Illegal invocation".
    const original = globalThis.fetch;
    const calls: unknown[] = [];
    globalThis.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      // El navegador exige que fetch se invoque con this === window/globalThis.
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      calls.push(args[0]);
      return Promise.resolve(
        new Response(JSON.stringify([sampleRow]), { status: 200, headers: { "content-type": "application/json" } })
      );
    } as typeof fetch;
    try {
      const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" });
      const events = await client.listEvents({ limit: 1 });
      expect(events).toHaveLength(1);
      expect(String(calls[0])).toContain("/rest/v1/catalog_events_v2");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("lists events and maps the catalog row shape", async () => {
    const { impl, capture } = fetchSpy([sampleRow]);
    const client = new CatalogClient({ url: "https://project.supabase.co/", publishableKey: "sb_publishable_TEST" }, impl);
    const events = await client.listEvents({ limit: 20 });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Alexisonfire en Teatro Coliseo");
    expect(events[0].slug).toBe("alexisonfire-en-teatro-coliseo");
    expect(events[0].artists[0].name).toBe("Alexisonfire");
    expect(events[0].sources[0].source).toBe("puntoticket");
    expect(events[0].sources[0].price_min).toBe(43700);
    expect(events[0].performances[0].timezone).toBe("America/Santiago");
    // time_known opcional: ausente en la fila de muestra (hora conocida).
    expect(events[0].performances[0].time_known).toBeUndefined();
    expect(events[0].next_performance_time_known).toBe(true);
    expect(capture.url).toContain("/rest/v1/catalog_events_v2");
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
    expect(capture.url).toContain("/rest/v1/catalog_events_v2");
    expect(capture.url).toContain("id=eq.1");
  });

  it("returns a single event by slug", async () => {
    const { impl, capture } = fetchSpy([sampleRow]);
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    const event = await client.getEventBySlug("alexisonfire-en-teatro-coliseo");
    expect(event?.slug).toBe("alexisonfire-en-teatro-coliseo");
    expect(capture.url).toContain("/rest/v1/catalog_events_v2");
    expect(capture.url).toContain("slug=eq.alexisonfire-en-teatro-coliseo");
  });

  it("returns an artist by slug from catalog_artists_v1", async () => {
    const artist = { id: 5, slug: "alexisonfire", name: "Alexisonfire", description: null, city: null, country: null, genre: null, image_url: null, links: {}, verified: false, events: [] };
    const { impl, capture } = fetchSpy([artist]);
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    const result = await client.getArtistBySlug("alexisonfire");
    expect(result?.slug).toBe("alexisonfire");
    expect(capture.url).toContain("/rest/v1/catalog_artists_v1");
    expect(capture.url).toContain("slug=eq.alexisonfire");
  });

  it("returns a venue by slug from catalog_venues_v1", async () => {
    const venue = { id: 3, slug: "teatro-coliseo", name: "Teatro Coliseo", address: null, city: "Santiago", latitude: null, longitude: null, capacity: null, links: {}, image_url: null, events: [] };
    const { impl, capture } = fetchSpy([venue]);
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    const result = await client.getVenueBySlug("teatro-coliseo");
    expect(result?.slug).toBe("teatro-coliseo");
    expect(capture.url).toContain("/rest/v1/catalog_venues_v1");
    expect(capture.url).toContain("slug=eq.teatro-coliseo");
  });

  it("wraps API failures in CatalogClientError", async () => {
    const impl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    await expect(client.listEvents()).rejects.toBeInstanceOf(CatalogClientError);
  });

  it("reads freshness via the RPC endpoint with a POST body", async () => {
    const { impl, capture } = fetchSpy([sampleFreshness]);
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    const freshness = await client.getFreshness("puntoticket");
    expect(freshness?.source).toBe("puntoticket");
    expect(freshness?.last_run_status).toBe("succeeded");
    expect(freshness?.last_run_finished_at).toBe("2026-09-13T12:34:00Z");
    expect(capture.url).toContain("/rest/v1/rpc/catalog_freshness_v1");
    expect(capture.method).toBe("POST");
    expect(JSON.parse(capture.body ?? "{}")).toEqual({ p_source: "puntoticket" });
    expect(capture.headers?.get("apikey")).toBe("sb_publishable_TEST");
  });

  it("sends a null source filter when none is provided", async () => {
    const { impl, capture } = fetchSpy([sampleFreshness]);
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    await client.getFreshness();
    expect(JSON.parse(capture.body ?? "{}")).toEqual({ p_source: null });
  });

  it("returns undefined when there is no publishable freshness yet", async () => {
    const { impl } = fetchSpy([]);
    const client = new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
    await expect(client.getFreshness("puntoticket")).resolves.toBeUndefined();
  });
});
