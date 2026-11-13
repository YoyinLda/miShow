import { describe, expect, it } from "vitest";
import { HttpClient, validateAcquisitionUrl, type HttpTransport } from "@mishow/scraper-core";
import { createPuntoticketAdapter, puntoticketAdapter } from "../src/adapter.js";
import { createFixedListSource } from "../src/discovery/fixed-list.js";
import { parseVenuePage } from "../src/extraction/venue.js";
import { scrapePuntoTicket } from "../src/acquisition/orchestrator.js";

const ORIGIN = "https://www.puntoticket.com";
const VENUE_A = `${ORIGIN}/recintos/teatro-a`;
const VENUE_B = `${ORIGIN}/recintos/teatro-b`;
const VENUE_C = `${ORIGIN}/recintos/teatro-c`;

function response(status: number, body: string, headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" }) {
  return { status, body, headers };
}

function detailHtml(name: string, startDate: string, code: string): string {
  return `<h1>${name}</h1><script type="application/ld+json">{"@type":"Event","name":"${name}","startDate":"${startDate}","offers":{"url":"/queue/enqueue/${code}","availability":"https://schema.org/InStock"}}</script>`;
}

function venueHtml(...slugs: string[]): string {
  return slugs.map((s) => `<article class="filtr-item event-item"><a href="/evento/${s}"><h3>${s}</h3></a></article>`).join("");
}

const MUSICA_EMPTY = "<html><body></body></html>";

function setup(opts: {
  urls: string[];
  transport: HttpTransport;
  sleep?: (ms: number) => Promise<void>;
  maxPages?: number;
  concurrency?: number;
}) {
  const adapter = createPuntoticketAdapter({ venueIndex: createFixedListSource(opts.urls) });
  const client = new HttpClient({
    adapter,
    config: { concurrency: opts.concurrency },
    transport: opts.transport,
    sleep: opts.sleep ?? (async () => undefined)
  });
  const run = () => scrapePuntoTicket({
    adapter,
    client,
    config: { concurrency: opts.concurrency },
    now: () => new Date("2026-09-08T12:00:00.000Z"),
    discovery: { enabled: true, maxPages: opts.maxPages ?? 10, maxPagesLimit: 25 }
  });
  return { adapter, run };
}

describe("PuntoTicket venue adapter: cortesía", () => {
  it("aplica delay >= 1000 ms antes de cada solicitud (musica, venues y detalles)", async () => {
    const sleeps: number[] = [];
    const calls: string[] = [];
    const { run } = setup({
      urls: [VENUE_A, VENUE_B],
      sleep: async (ms) => { sleeps.push(ms); },
      transport: async (req) => {
        calls.push(req.url);
        if (req.url.endsWith("/musica")) return response(200, MUSICA_EMPTY);
        if (req.url === VENUE_A) return response(200, venueHtml("E1"));
        if (req.url === VENUE_B) return response(200, venueHtml("E2"));
        return response(200, detailHtml("Evento", "2026-12-12T20:00:00-03:00", "X"));
      }
    });
    const result = await run();
    expect(calls).toHaveLength(5);
    expect(sleeps).toHaveLength(5);
    expect(Math.min(...sleeps)).toBeGreaterThanOrEqual(1000);
    expect(result.events).toHaveLength(2);
  });

  it("no excede concurrencia 2 aunque se pida mayor y rechaza concurrencia > 2", async () => {
    let inFlight = 0;
    let peak = 0;
    const { run } = setup({
      urls: [VENUE_A, VENUE_B, VENUE_C],
      concurrency: 2,
      transport: async (req) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        if (req.url.endsWith("/musica")) return response(200, MUSICA_EMPTY);
        if (req.url.includes("/recintos/")) return response(200, venueHtml(`E${req.url.slice(-1)}`));
        return response(200, detailHtml("Evento", "2026-12-12T20:00:00-03:00", "X"));
      }
    });
    await run();
    expect(peak).toBeLessThanOrEqual(2);
    expect(() => setup({ urls: [], concurrency: 3, transport: async () => response(200, "") })).toThrow();
  });

  it("reintenta una página de venue con 429 como máximo 2 veces y continúa", async () => {
    const hits: Record<string, number> = {};
    const { run } = setup({
      urls: [VENUE_A, VENUE_B],
      transport: async (req) => {
        hits[req.url] = (hits[req.url] ?? 0) + 1;
        if (req.url.endsWith("/musica")) return response(200, MUSICA_EMPTY);
        if (req.url === VENUE_A) return response(429, "", { "retry-after": "1" });
        if (req.url === VENUE_B) return response(200, venueHtml("E2"));
        return response(200, detailHtml("Evento", "2026-12-12T20:00:00-03:00", "X"));
      }
    });
    const result = await run();
    expect(hits[VENUE_A]).toBe(3); // 1 intento + 2 reintentos
    expect(result.errors).toMatchObject([{ stage: "listing", source_url: VENUE_A }]);
    expect(result.events).toHaveLength(1);
    expect(result.discovery?.venue_pages).toEqual({ requested: 2, succeeded: 1, failed: 1 });
  });
});

describe("PuntoTicket venue adapter: rutas robots rechazadas", () => {
  it("rechaza como venue rutas /Pago, /Comprar, /Login, /Categoria, /Seleccion (sin solicitud)", async () => {
    const paths = ["/Pago/x", "/Comprar/x", "/Login", "/Categoria/rock", "/Seleccion/x", "/pago", "/comprar/evento/A/cal/1"];
    const calls: string[] = [];
    const { adapter, run } = setup({
      urls: paths.map((p) => `${ORIGIN}${p}`),
      transport: async (req) => {
        calls.push(req.url);
        return response(200, MUSICA_EMPTY);
      }
    });
    for (const p of paths) {
      expect(() => validateAcquisitionUrl(adapter, `${ORIGIN}${p}`, "listing", undefined, { secondaryListing: true })).toThrow();
    }
    const result = await run();
    expect(calls).toEqual([`${ORIGIN}/musica`]);
    expect(result.errors.filter((e) => e.code === "url_rejected")).toHaveLength(paths.length);
    expect(result.discovery?.venue_pages).toMatchObject({ requested: paths.length, succeeded: 0, failed: paths.length });
  });
});

describe("PuntoTicket venue adapter: fixed-list", () => {
  it("0 URLs: cero páginas y allowlist vacía", async () => {
    const source = createFixedListSource([]);
    expect(await source.list({ getHtml: async () => "" })).toEqual([]);
    expect(source.isSecondaryPagePath("/recintos/teatro-a")).toBe(false);
  });

  it("1 URL y N URLs en orden", async () => {
    expect(await createFixedListSource([VENUE_A]).list({ getHtml: async () => "" })).toEqual([VENUE_A]);
    const many = createFixedListSource([VENUE_A, VENUE_B, VENUE_C]);
    expect(await many.list({ getHtml: async () => "" })).toEqual([VENUE_A, VENUE_B, VENUE_C]);
    expect(many.isSecondaryPagePath("/recintos/teatro-b")).toBe(true);
    expect(many.isSecondaryPagePath("/recintos/otro")).toBe(false);
  });

  it("URL duplicada (incluye variantes canónicas) se solicita una sola vez", async () => {
    const source = createFixedListSource([VENUE_A, `${VENUE_A}/`, `${VENUE_A}?x=1#f`, VENUE_B]);
    expect(await source.list({ getHtml: async () => "" })).toEqual([VENUE_A, VENUE_B]);
    const calls: string[] = [];
    const { run } = setup({
      urls: [VENUE_A, VENUE_A],
      transport: async (req) => {
        calls.push(req.url);
        return response(200, req.url.endsWith("/musica") ? MUSICA_EMPTY : venueHtml());
      }
    });
    await run();
    expect(calls.filter((u) => u === VENUE_A)).toHaveLength(1);
  });

  it("página de venue sin enlaces: cero referencias, página exitosa, sin errores", async () => {
    expect(parseVenuePage("<html><body><p>Sin eventos</p></body></html>", VENUE_A)).toEqual([]);
    const { run } = setup({
      urls: [VENUE_A],
      transport: async (req) => response(200, req.url.endsWith("/musica") ? MUSICA_EMPTY : "<html><body><p>Sin eventos</p></body></html>")
    });
    const result = await run();
    expect(result.errors).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.discovery).toMatchObject({ missing_count: 0, total_unique: 0, venue_pages: { requested: 1, succeeded: 1, failed: 0 } });
  });
});

describe("PuntoTicket venue adapter: evento solo-venue", () => {
  it("normaliza timezone IANA y starts_at con offset", async () => {
    const { run } = setup({
      urls: [VENUE_A],
      transport: async (req) => {
        if (req.url.endsWith("/musica")) return response(200, MUSICA_EMPTY);
        if (req.url === VENUE_A) return response(200, venueHtml("SOLO-VENUE"));
        if (req.url.endsWith("/evento/SOLO-VENUE")) return response(200, detailHtml("Solo Venue", "2026-12-12T20:00:00-03:00", "SV"));
        throw new Error(`unexpected ${req.url}`);
      }
    });
    const result = await run();
    expect(result.discovery?.missing).toEqual([`${ORIGIN}/evento/SOLO-VENUE`]);
    expect(result.events).toHaveLength(1);
    const perf = result.events[0].performances[0];
    expect(perf.timezone).toBe("America/Santiago");
    expect(perf.starts_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(perf.starts_at).toBe("2026-12-12T20:00:00-03:00");
  });
});

describe("PuntoTicket: compatibilidad de contrato", () => {
  it("listingUrl por defecto es /musica y el adapter base no tiene discovery", () => {
    expect(puntoticketAdapter.listingUrl).toBe(`${ORIGIN}/musica`);
    expect(puntoticketAdapter.discovery).toBeUndefined();
    expect(createPuntoticketAdapter().discovery).toBeUndefined();
    expect(createPuntoticketAdapter({ venueIndex: createFixedListSource([VENUE_A]) }).listingUrl).toBe(`${ORIGIN}/musica`);
  });

  it("scrapePuntoTicket sin discovery ni adapter mantiene la firma y no emite clave discovery", async () => {
    expect(scrapePuntoTicket.length).toBe(1);
    const calls: string[] = [];
    const client = new HttpClient({
      adapter: puntoticketAdapter,
      transport: async (req) => {
        calls.push(req.url);
        return response(200, MUSICA_EMPTY);
      },
      sleep: async () => undefined
    });
    const result = await scrapePuntoTicket({ client, now: () => new Date("2026-09-08T12:00:00.000Z") });
    expect(calls).toEqual([`${ORIGIN}/musica`]);
    expect(result).not.toHaveProperty("discovery");
  });
});
