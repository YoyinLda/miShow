import { describe, expect, it } from "vitest";
import type { HttpTransport } from "@mishow/scraper-core";
import { CliUsageError } from "../src/cli/scrape-args.js";
import { buildScrape } from "../src/cli/scrape-run.js";

const ORIGIN = "https://www.puntoticket.com";
const NOW = () => new Date("2026-09-08T12:00:00.000Z");
const html = { "content-type": "text/html; charset=utf-8" };
const sleep = async () => undefined;

const musica = `<article class="filtr-item event-item"><a href="/evento/M1"><h3>M1</h3></a></article>`;
const venuePage = `<article class="filtr-item event-item"><a href="/evento/V1"><h3>V1</h3></a></article>`;
const detail = (name: string) =>
  `<h1>${name}</h1><script type="application/ld+json">{"@type":"Event","name":"${name}","startDate":"2026-12-12T20:00:00-03:00","offers":{"url":"/queue/enqueue/X","availability":"https://schema.org/InStock"}}</script>`;

const SLUGS = ["teatro-a", "teatro-b", "teatro-c", "teatro-d", "teatro-e"];
const loader = async () => SLUGS.map((s) => ({ source_slug: s, source_url: `${ORIGIN}/${s}` }));
const venueUrls = new Set(SLUGS.map((s) => `${ORIGIN}/${s}`));

function transport(calls: string[]): HttpTransport {
  return async (req) => {
    calls.push(req.url);
    if (req.url.endsWith("/musica")) return { status: 200, body: musica, headers: html };
    if (venueUrls.has(req.url)) return { status: 200, body: venuePage, headers: html };
    return { status: 200, body: detail(req.url.split("/").pop() ?? "E"), headers: html };
  };
}

async function run(args: string[], env: Record<string, string | undefined>) {
  const calls: string[] = [];
  const { scrape } = buildScrape(args, env, { transport: transport(calls), now: NOW, sleep, venueSourcesLoader: loader });
  const result = await scrape();
  return { result, venueCalls: calls.filter((u) => venueUrls.has(u)) };
}

describe("CLI puntoticket-scrape fase 2", () => {
  it("sin habilitar la salida es idéntica con o sin variables de discovery ajenas (sin clave discovery, sin venues)", async () => {
    const plain = await run(["--live"], {});
    const withEnv = await run(["--live"], { PUNTOTICKET_VENUE_DISCOVERY: "false", PUNTOTICKET_MAX_VENUE_PAGES: "2" });
    expect(JSON.stringify(withEnv.result)).toBe(JSON.stringify(plain.result));
    expect("discovery" in plain.result).toBe(false);
    expect(plain.venueCalls).toEqual([]);
  });

  it("habilitado por env incluye discovery y consulta venues de db-venues", async () => {
    const { result, venueCalls } = await run(["--live"], { PUNTOTICKET_VENUE_DISCOVERY: "true" });
    expect(venueCalls.length).toBe(SLUGS.length);
    expect(result.discovery?.venue_pages).toEqual({ requested: SLUGS.length, succeeded: SLUGS.length, failed: 0 });
    expect(result.events.length).toBeGreaterThanOrEqual(2);
  });

  it("habilitado por flag equivale a habilitado por env", async () => {
    const byFlag = await run(["--live", "--venue-discovery"], {});
    const byEnv = await run(["--live"], { PUNTOTICKET_VENUE_DISCOVERY: "true" });
    expect(JSON.stringify(byFlag.result)).toBe(JSON.stringify(byEnv.result));
    expect(byFlag.result.discovery).toBeDefined();
  });

  it("--max-venue-pages tiene prioridad sobre PUNTOTICKET_MAX_VENUE_PAGES", async () => {
    const env = { PUNTOTICKET_MAX_VENUE_PAGES: "4", PUNTOTICKET_MAX_VENUE_PAGES_LIMIT: "10" };
    const { result, venueCalls } = await run(["--live", "--venue-discovery", "--max-venue-pages", "2"], env);
    expect(venueCalls.length).toBe(2);
    expect(result.discovery?.venue_pages.requested).toBe(2);
    const fromEnv = await run(["--live", "--venue-discovery"], env);
    expect(fromEnv.venueCalls.length).toBe(4);
  });

  it("--max-venue-pages respeta el tope duro PUNTOTICKET_MAX_VENUE_PAGES_LIMIT", async () => {
    const env = { PUNTOTICKET_MAX_VENUE_PAGES: "1", PUNTOTICKET_MAX_VENUE_PAGES_LIMIT: "3" };
    const ok = await run(["--live", "--venue-discovery", "--max-venue-pages", "3"], env);
    expect(ok.venueCalls.length).toBe(3);
    expect(() =>
      buildScrape(["--live", "--venue-discovery", "--max-venue-pages", "4"], env, { transport: transport([]), now: NOW, venueSourcesLoader: loader })
    ).toThrow(CliUsageError);
  });

  it("variables inválidas se rechazan", () => {
    const deps = { transport: transport([]), now: NOW, venueSourcesLoader: loader };
    expect(() => buildScrape(["--live"], { PUNTOTICKET_VENUE_DISCOVERY: "yes" }, deps)).toThrow(CliUsageError);
    expect(() => buildScrape(["--live", "--venue-discovery"], { PUNTOTICKET_MAX_VENUE_PAGES: "abc" }, deps)).toThrow(CliUsageError);
    expect(() =>
      buildScrape(["--live", "--venue-discovery"], { PUNTOTICKET_MAX_VENUE_PAGES: "9", PUNTOTICKET_MAX_VENUE_PAGES_LIMIT: "5" }, deps)
    ).toThrow(CliUsageError);
  });
});
