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
  capture: { url?: string; headers?: Headers; method?: string; body?: string } = {},
  responseHeaders: Record<string, string> = {}
) {
  const impl = (async (input: string, init?: RequestInit) => {
    capture.url = String(input);
    capture.headers = new Headers(init?.headers);
    capture.method = init?.method;
    capture.body = init?.body ? String(init.body) : undefined;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json", ...responseHeaders }
    });
  }) as unknown as typeof fetch;
  return { impl, capture };
}

/**
 * fetch inyectado por secuencia: cada llamada consume la siguiente respuesta de
 * `pages` y acumula la URL en `urls`. Útil para `listEvents` en la primera
 * página, que hace primero la query de conteo (Content-Range) y luego la de
 * datos.
 */
function fetchSequence(pages: Array<{ body: unknown; headers?: Record<string, string> }>) {
  const urls: string[] = [];
  let call = 0;
  const impl = (async (input: string) => {
    urls.push(String(input));
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return new Response(JSON.stringify(page.body), {
      status: 200,
      headers: { "content-type": "application/json", ...(page.headers ?? {}) }
    });
  }) as unknown as typeof fetch;
  return { impl, urls };
}

function makeClient(impl: typeof fetch) {
  return new CatalogClient({ url: "https://project.supabase.co", publishableKey: "sb_publishable_TEST" }, impl);
}

function rowWith(id: number, nextAt: string | null): CatalogEvent {
  return { ...sampleRow, id, slug: `evento-${id}`, next_performance_at: nextAt };
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
      const result = await client.listEvents({ limit: 1 });
      expect(result.items).toHaveLength(1);
      expect(String(calls[0])).toContain("/rest/v1/catalog_events_v2");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("lists events and maps the catalog row shape", async () => {
    const { impl, capture } = fetchSpy([sampleRow]);
    const client = new CatalogClient({ url: "https://project.supabase.co/", publishableKey: "sb_publishable_TEST" }, impl);
    const result = await client.listEvents({ limit: 20 });
    const events = result.items;
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
    // `capture` guarda la ÚLTIMA llamada: la query de datos (tras la de conteo).
    expect(capture.url).toContain("/rest/v1/catalog_events_v2");
    expect(capture.headers?.get("apikey")).toBe("sb_publishable_TEST");
  });

  it("applies a case-insensitive name search filter", async () => {
    const { impl, capture } = fetchSpy([]);
    const client = makeClient(impl);
    await client.listEvents({ search: "alexis" });
    expect(capture.url).toContain("name=ilike.");
    expect(decodeURIComponent(capture.url ?? "")).toContain("*alexis*");
  });

  it("returns the first page with total parsed from Content-Range and a nonnull cursor", async () => {
    // Primera página: 1ª llamada = conteo (Content-Range 0-19/142), 2ª = datos.
    const items = Array.from({ length: 20 }, (_, i) => rowWith(i + 1, `2026-11-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    const { impl, urls } = fetchSequence([
      { body: [], headers: { "content-range": "0-19/142" } },
      { body: items }
    ]);
    const client = makeClient(impl);
    const result = await client.listEvents({ limit: 20 });
    expect(result.items).toHaveLength(20);
    expect(result.total).toBe(142);
    expect(urls[0]).toContain("select=id"); // query de conteo (payload mínimo)
    expect(urls[0]).not.toBe(urls[1]); // conteo != datos
    expect(urls[1]).toContain("order=next_performance_at.asc.nullslast%2Cid.asc");
    expect(result.nextCursor).toEqual({ phase: "nonnull", nextAt: "2026-11-20T00:00:00Z", id: 20 });
  });

  it("sends Prefer: count=exact on the first-page count query only", async () => {
    const captures: Headers[] = [];
    const impl = (async (_input: string, init?: RequestInit) => {
      captures.push(new Headers(init?.headers));
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json", "content-range": "*/0" }
      });
    }) as unknown as typeof fetch;
    const client = makeClient(impl);
    await client.listEvents({ limit: 20 });
    expect(captures[0].get("prefer")).toBe("count=exact");
    expect(captures[1]?.get("prefer")).toBeNull();
  });

  it("consumes a nonnull cursor and builds the keyset or= filter on the next page", async () => {
    const { impl, capture } = fetchSpy(Array.from({ length: 20 }, (_, i) => rowWith(100 + i, "2026-12-01T00:00:00Z")));
    const client = makeClient(impl);
    const result = await client.listEvents({
      limit: 20,
      cursor: { phase: "nonnull", nextAt: "2026-11-27T00:00:00+00:00", id: 42 }
    });
    const url = decodeURIComponent(capture.url ?? "");
    expect(url).toContain(
      "or=(next_performance_at.gt.2026-11-27T00:00:00+00:00,and(next_performance_at.eq.2026-11-27T00:00:00+00:00,id.gt.42))"
    );
    // Con cursor presente NO se recalcula el total.
    expect(result.total).toBeNull();
    expect(result.nextCursor).toEqual({ phase: "nonnull", nextAt: "2026-12-01T00:00:00Z", id: 119 });
  });

  it("transitions phase A -> phase B when a nonnull page returns fewer than limit rows", async () => {
    const { impl } = fetchSpy([rowWith(5, "2026-12-10T00:00:00Z")]);
    const client = makeClient(impl);
    const result = await client.listEvents({
      limit: 20,
      cursor: { phase: "nonnull", nextAt: "2026-12-01T00:00:00Z", id: 4 }
    });
    expect(result.nextCursor).toEqual({ phase: "null", nextAt: null, id: 0 });
  });

  it("queries the NULL zone in phase B with next_performance_at=is.null and id=gt", async () => {
    const { impl, capture } = fetchSpy(Array.from({ length: 20 }, (_, i) => rowWith(200 + i, null)));
    const client = makeClient(impl);
    const result = await client.listEvents({
      limit: 20,
      cursor: { phase: "null", nextAt: null, id: 0 }
    });
    const url = decodeURIComponent(capture.url ?? "");
    expect(url).toContain("next_performance_at=is.null");
    expect(url).toContain("order=id.asc");
    expect(url).toContain("id=gt.0");
    expect(result.nextCursor).toEqual({ phase: "null", nextAt: null, id: 219 });
  });

  it("returns nextCursor null when phase B is exhausted", async () => {
    const { impl } = fetchSpy([rowWith(300, null)]);
    const client = makeClient(impl);
    const result = await client.listEvents({
      limit: 20,
      cursor: { phase: "null", nextAt: null, id: 299 }
    });
    expect(result.nextCursor).toBeNull();
  });

  it("adds gte/lte range filters to both the count and data queries", async () => {
    const { impl, urls } = fetchSequence([
      { body: [], headers: { "content-range": "0-0/5" } },
      { body: [rowWith(1, "2026-12-12T12:00:00Z")] }
    ]);
    const client = makeClient(impl);
    const result = await client.listEvents({
      limit: 20,
      range: { gteISO: "2026-12-12T03:00:00.000Z", lteISO: "2026-12-13T02:59:59.999Z" }
    });
    const countUrl = decodeURIComponent(urls[0]);
    const dataUrl = decodeURIComponent(urls[1]);
    // Conteo restringido al rango.
    expect(countUrl).toContain("select=id");
    expect(countUrl).toContain("next_performance_at=gte.2026-12-12T03:00:00.000Z");
    expect(countUrl).toContain("next_performance_at=lte.2026-12-13T02:59:59.999Z");
    // Datos restringidos al rango.
    expect(dataUrl).toContain("next_performance_at=gte.2026-12-12T03:00:00.000Z");
    expect(dataUrl).toContain("next_performance_at=lte.2026-12-13T02:59:59.999Z");
    expect(result.total).toBe(5);
  });

  it("supports an open-ended range (only gte)", async () => {
    const { impl, urls } = fetchSequence([
      { body: [], headers: { "content-range": "*/0" } },
      { body: [] }
    ]);
    const client = makeClient(impl);
    await client.listEvents({ limit: 20, range: { gteISO: "2026-12-12T18:00:00.000Z" } });
    const dataUrl = decodeURIComponent(urls[1]);
    expect(dataUrl).toContain("next_performance_at=gte.2026-12-12T18:00:00.000Z");
    expect(dataUrl).not.toContain("lte.");
  });

  it("forces phase A with a range: no NULL-zone jump, incomplete page ends data", async () => {
    const { impl } = fetchSequence([
      { body: [], headers: { "content-range": "0-0/1" } },
      { body: [rowWith(7, "2026-12-12T20:00:00Z")] }
    ]);
    const client = makeClient(impl);
    const result = await client.listEvents({ limit: 20, range: { gteISO: "2026-12-12T03:00:00.000Z" } });
    // Página incompleta con rango => fin de datos, nunca { phase: 'null' }.
    expect(result.nextCursor).toBeNull();
  });

  it("produces a byte-identical data URL when no range is given (backward compatible)", async () => {
    const withoutRange = fetchSpy([]);
    const client1 = makeClient(withoutRange.impl);
    await client1.listEvents({ limit: 20, cursor: { phase: "nonnull", nextAt: "2026-12-01T00:00:00Z", id: 10 } });

    const withEmptyParams = fetchSpy([]);
    const client2 = makeClient(withEmptyParams.impl);
    await client2.listEvents({ limit: 20, cursor: { phase: "nonnull", nextAt: "2026-12-01T00:00:00Z", id: 10 } });

    // Sin range, la URL de datos es idéntica y no contiene filtros de fecha.
    expect(withoutRange.capture.url).toBe(withEmptyParams.capture.url);
    expect(withoutRange.capture.url).not.toContain("next_performance_at=gte.");
    expect(withoutRange.capture.url).not.toContain("next_performance_at=lte.");
  });

  it("includes name=ilike in the data query when searching", async () => {
    const { impl, capture } = fetchSpy([]);
    const client = makeClient(impl);
    await client.listEvents({ search: "coliseo", cursor: { phase: "nonnull", nextAt: "2026-12-01T00:00:00Z", id: 10 } });
    expect(decodeURIComponent(capture.url ?? "")).toContain("name=ilike.*coliseo*");
  });

  it("parses Content-Range totals and falls back to null", async () => {
    const cases: Array<{ header?: string; expected: number | null }> = [
      { header: "0-19/142", expected: 142 },
      { header: "*/0", expected: 0 },
      { header: "*/*", expected: null },
      { header: undefined, expected: null }
    ];
    for (const { header, expected } of cases) {
      const { impl } = fetchSequence([
        { body: [], headers: header ? { "content-range": header } : {} },
        { body: [] }
      ]);
      const client = makeClient(impl);
      const result = await client.listEvents({ limit: 20 });
      expect(result.total).toBe(expected);
    }
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
