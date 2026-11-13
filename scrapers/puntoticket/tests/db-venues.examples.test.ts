import { describe, expect, it } from "vitest";
import { HttpClient, validateAcquisitionUrl, type HttpTransport } from "@mishow/scraper-core";
import { createPuntoticketAdapter } from "../src/adapter.js";
import { createDbVenuesIndex, type VenueSourceRow } from "../src/discovery/db-venues.js";
import { createFixedListSource } from "../src/discovery/fixed-list.js";
import { scrapePuntoTicket } from "../src/acquisition/orchestrator.js";

const ORIGIN = "https://www.puntoticket.com";
const row = (slug: string, url = `${ORIGIN}/${slug}`): VenueSourceRow => ({ source_slug: slug, source_url: url });
const res = (status: number, body: string) => ({ status, body, headers: { "content-type": "text/html; charset=utf-8" } });
const EMPTY = "<html><body></body></html>";
const card = (slug: string) => `<article class="filtr-item event-item"><a href="/evento/${slug}"><h3>${slug}</h3></a></article>`;
const detail = (name: string) =>
  `<h1>${name}</h1><script type="application/ld+json">{"@type":"Event","name":"${name}","startDate":"2026-12-12T20:00:00-03:00","offers":{"url":"/queue/enqueue/X","availability":"https://schema.org/InStock"}}</script>`;

function run(index: ReturnType<typeof createDbVenuesIndex> | ReturnType<typeof createFixedListSource>, transport: HttpTransport) {
  const adapter = createPuntoticketAdapter({ venueIndex: index });
  const client = new HttpClient({ adapter, transport, sleep: async () => undefined });
  return scrapePuntoTicket({
    adapter,
    client,
    now: () => new Date("2026-09-08T12:00:00.000Z"),
    discovery: { enabled: true, maxPages: 10, maxPagesLimit: 25 }
  });
}

describe("db-venues: 0, 1 y N filas (Req 12.1)", () => {
  it("0 filas: cero páginas, allowlist vacía y la corrida sigue con /musica", async () => {
    const calls: string[] = [];
    const index = createDbVenuesIndex(async () => []);
    const result = await run(index, async (req) => {
      calls.push(req.url);
      return res(200, EMPTY);
    });
    expect(calls).toEqual([`${ORIGIN}/musica`]);
    expect(index.allowedPaths().size).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.discovery?.venue_pages).toMatchObject({ requested: 0, succeeded: 0, failed: 0 });
  });

  it("1 fila: solicita la página y descubre su evento", async () => {
    const calls: string[] = [];
    const result = await run(createDbVenuesIndex(async () => [row("claro-arena")]), async (req) => {
      calls.push(req.url);
      if (req.url.endsWith("/musica")) return res(200, EMPTY);
      if (req.url === `${ORIGIN}/claro-arena`) return res(200, card("E1"));
      return res(200, detail("Evento 1"));
    });
    expect(calls).toContain(`${ORIGIN}/claro-arena`);
    expect(result.events).toHaveLength(1);
    expect(result.discovery?.venue_pages).toEqual({ requested: 1, succeeded: 1, failed: 0 });
  });

  it("N filas: solicita cada página una vez", async () => {
    const slugs = ["a-uno", "b-dos", "c-tres"];
    const calls: string[] = [];
    const result = await run(createDbVenuesIndex(async () => slugs.map((s) => row(s))), async (req) => {
      calls.push(req.url);
      if (req.url.endsWith("/musica")) return res(200, EMPTY);
      if (slugs.some((s) => req.url === `${ORIGIN}/${s}`)) return res(200, EMPTY);
      throw new Error(`inesperada ${req.url}`);
    });
    for (const s of slugs) expect(calls.filter((u) => u === `${ORIGIN}/${s}`)).toHaveLength(1);
    expect(result.discovery?.venue_pages).toEqual({ requested: 3, succeeded: 3, failed: 0 });
  });
});

describe("db-venues: source_url inconsistente (Req 12.5, 12.6)", () => {
  it("omite la fila, no solicita su URL ni la admite en la allowlist", async () => {
    const calls: string[] = [];
    const index = createDbVenuesIndex(async () => [row("buena"), row("mala", `${ORIGIN}/otra-ruta`), row("host", "https://evil.example/host")]);
    await run(index, async (req) => {
      calls.push(req.url);
      return res(200, EMPTY);
    });
    expect([...index.allowedPaths()]).toEqual(["/buena"]);
    expect(index.rejectedRows().map((r) => r.source_slug)).toEqual(["mala", "host"]);
    expect(calls.some((u) => u.includes("otra-ruta") || u.includes("evil.example"))).toBe(false);
    expect(createPuntoticketAdapter({ venueIndex: index }).discovery!.isSecondaryPagePath("/otra-ruta")).toBe(false);
  });
});

describe("db-venues: loader que falla (Req 12.5)", () => {
  it("registra venue_index_failed y continúa con /musica", async () => {
    const calls: string[] = [];
    const index = createDbVenuesIndex(async () => {
      throw new Error("db caída");
    });
    const result = await run(index, async (req) => {
      calls.push(req.url);
      if (req.url.endsWith("/musica")) return res(200, card("DE-MUSICA"));
      return res(200, detail("De Musica"));
    });
    expect(result.errors.map((e) => e.code)).toContain("venue_index_failed");
    expect(calls[0]).toBe(`${ORIGIN}/musica`);
    expect(result.events).toHaveLength(1);
  });
});

describe("db-venues: colisión de slug con landing de evento (Req 12.3, 12.6)", () => {
  it("una ruta /<slug> fuera de la allowlist se rechaza como página de venue", async () => {
    const index = createDbVenuesIndex(async () => [row("claro-arena")]);
    await index.list({ getHtml: async () => "" });
    const adapter = createPuntoticketAdapter({ venueIndex: index });
    const ok = () => validateAcquisitionUrl(adapter, `${ORIGIN}/claro-arena`, "listing", undefined, { secondaryListing: true });
    const landing = () => validateAcquisitionUrl(adapter, `${ORIGIN}/landing-del-evento`, "listing", undefined, { secondaryListing: true });
    expect(ok).not.toThrow();
    expect(landing).toThrow();
    // El listado principal no cambia: /musica sigue permitido sin secondaryListing.
    expect(() => validateAcquisitionUrl(adapter, `${ORIGIN}/musica`, "listing")).not.toThrow();
  });
});

describe("fixed-list como respaldo (Req 12.7)", () => {
  it("funciona sin loader de base de datos", async () => {
    const calls: string[] = [];
    const result = await run(createFixedListSource([`${ORIGIN}/recintos/teatro-a`]), async (req) => {
      calls.push(req.url);
      if (req.url.endsWith("/musica")) return res(200, EMPTY);
      if (req.url.endsWith("/recintos/teatro-a")) return res(200, card("E1"));
      return res(200, detail("Evento 1"));
    });
    expect(calls).toContain(`${ORIGIN}/recintos/teatro-a`);
    expect(result.events).toHaveLength(1);
    expect(result.discovery?.venue_pages.succeeded).toBe(1);
  });
});
