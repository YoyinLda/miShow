/**
 * Spec ticketmaster-scrape-failures, tarea 3.9 (brief 008): unitarios de la
 * resiliencia de Ticketmaster. Sin red real.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { EventPersistence, FinishRunInput, ScrapeErrorInput } from "@mishow/scraper-core";
import { scrapeTicketmaster } from "../src/acquisition/orchestrator.js";
import { TicketmasterHttpClient, type HttpTransport } from "../src/acquisition/http.js";
import { acquisitionConfig, failOnPartial, ticketmasterResilience } from "../src/acquisition/policy.js";
import { executePersistedTicketmasterScrape } from "../src/persistence/workflow.js";

const listingFixture = readFileSync(new URL("./fixtures/ticketmaster-listing.html", import.meta.url), "utf8");
const detailOk = readFileSync(new URL("./fixtures/ticketmaster-detail-startdate.html", import.meta.url), "utf8");
const LISTING = "https://www.ticketmaster.cl/page/musica";
const html = (status: number, body: string, headers: Record<string, string> = {}) => ({
  status,
  body,
  headers: { "content-type": "text/html; charset=utf-8", ...headers }
});
const now = () => new Date("2026-11-14T12:00:00.000Z");

function config(overrides: Record<string, unknown> = {}) {
  return acquisitionConfig({ resilience: { ...ticketmasterResilience({}), minListingRefs: 1, ...overrides } });
}

function client(transport: HttpTransport, cfg = config(), sleeps: number[] = []) {
  return new TicketmasterHttpClient({ transport, config: cfg, sleep: async (ms) => { sleeps.push(ms); }, random: () => 0.5 });
}

describe("variables TM_*", () => {
  it("defaults aprobados (D1/D2)", () => {
    expect(ticketmasterResilience({})).toEqual({ classifyBlocking: true, jitterRatio: 0.5, minListingRefs: 10, degradedRatio: 0.25, failedRatio: 0.75 });
    expect(failOnPartial({})).toBe(false);
  });
  it("acepta valores válidos y rechaza inválidos", () => {
    expect(ticketmasterResilience({ TM_DEGRADED_RATIO: "0.1", TM_FAILED_RATIO: "0.9", TM_MIN_LISTING_REFS: "5" }))
      .toMatchObject({ degradedRatio: 0.1, failedRatio: 0.9, minListingRefs: 5 });
    expect(() => ticketmasterResilience({ TM_DEGRADED_RATIO: "1.5" })).toThrow();
    expect(() => ticketmasterResilience({ TM_DEGRADED_RATIO: "0.8", TM_FAILED_RATIO: "0.5" })).toThrow();
    expect(() => ticketmasterResilience({ TM_MIN_LISTING_REFS: "-1" })).toThrow();
    expect(failOnPartial({ TM_FAIL_ON_PARTIAL: "true" })).toBe(true);
    expect(() => failOnPartial({ TM_FAIL_ON_PARTIAL: "yes" })).toThrow();
  });
});

describe("HTTP con classifyBlocking", () => {
  it("401 no se reintenta y se clasifica como blocked", async () => {
    let calls = 0;
    const error = await client(async () => { calls += 1; return html(401, "no"); }).getHtml(LISTING, "listing").catch((e) => e);
    expect(calls).toBe(1);
    expect(error.code).toBe("blocked");
    expect(error.httpStatus).toBe(401);
  });
  it("429 respeta Retry-After acotado por maxRetryAfterMs", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await client(async () => { calls += 1; return calls === 1 ? html(429, "", { "retry-after": "120" }) : html(200, "<html></html>"); }, config(), sleeps)
      .getHtml(LISTING, "listing");
    expect(sleeps).toContain(30000);
  });
  it("Content-Type ausente => challenge", async () => {
    const error = await client(async () => ({ status: 200, body: "{}", headers: {} })).getHtml(LISTING, "listing").catch((e) => e);
    expect(error.code).toBe("challenge");
  });
});

/** Listado del fixture (2 eventos); `failing` de ellos devuelve 403. */
function detailTransport(failing: number): HttpTransport {
  let seen = 0;
  return async ({ url }) => {
    if (url === LISTING) return html(200, listingFixture);
    seen += 1;
    return seen <= failing ? html(403, "forbidden") : html(200, detailOk);
  };
}

describe("health por ratio de fallas (D1)", () => {
  it("0 de 2 => ok; 1 de 2 (0.5) => degraded; 2 de 2 => failed", async () => {
    const run = async (failing: number) => (await scrapeTicketmaster({ client: client(detailTransport(failing)), config: config(), now })).health;
    expect(await run(0)).toBe("ok");
    expect(await run(1)).toBe("degraded");
    expect(await run(2)).toBe("failed");
  });
  it("bordes exactos: ratio igual al umbral cuenta", async () => {
    const result = await scrapeTicketmaster({ client: client(detailTransport(1), config({ degradedRatio: 0.5, failedRatio: 0.5 })), config: config({ degradedRatio: 0.5, failedRatio: 0.5 }), now });
    expect(result.health).toBe("failed");
    expect(result.summary.failure_breakdown).toEqual({ blocked: 1 });
  });
  it("listado bajo el mínimo => listing_degraded y al menos degraded", async () => {
    const cfg = config({ minListingRefs: 10 });
    const result = await scrapeTicketmaster({ client: client(detailTransport(0), cfg), config: cfg, now });
    expect(result.errors.map((e) => e.code)).toContain("listing_degraded");
    expect(result.health).toBe("degraded");
  });
});

describe("integración con persistencia en memoria", () => {
  function memory() {
    const errors: ScrapeErrorInput[] = [];
    const finished: FinishRunInput[] = [];
    let persisted = 0;
    const persistence: EventPersistence = {
      startRun: async () => ({ run_id: "run-1", status: "running" }),
      persistEvent: async () => { persisted += 1; return { event_id: "e", warnings: [] }; },
      recordError: async (_id, error) => { errors.push(error); },
      finishRun: async (_id, result) => { finished.push(result); }
    };
    return { persistence, errors, finished, persisted: () => persisted };
  }
  const start = { source: "ticketmaster", listing_url: LISTING, started_at: now().toISOString(), parameters: {} };

  it("corrida mixta => partial con el evento válido persistido y blocked registrado", async () => {
    const mem = memory();
    const cfg = config();
    const result = await executePersistedTicketmasterScrape({
      persistence: mem.persistence, start, now,
      scrape: () => scrapeTicketmaster({ client: client(detailTransport(1), cfg), config: cfg, now })
    });
    expect(result.status).toBe("partial");
    expect(mem.persisted()).toBe(1);
    expect(mem.errors.map((e) => e.code)).toContain("blocked");
  });

  it("listado 403 => failed con blocked (no global_acquisition_failure)", async () => {
    const mem = memory();
    const cfg = config();
    await executePersistedTicketmasterScrape({
      persistence: mem.persistence, start, now,
      scrape: () => scrapeTicketmaster({ client: client(async () => html(403, "x"), cfg), config: cfg, now })
    }).catch(() => undefined);
    expect(mem.finished[0]?.status).toBe("failed");
    expect(mem.errors[0]).toMatchObject({ code: "blocked", stage: "listing" });
  });
});
