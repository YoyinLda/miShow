/**
 * Spec ticketmaster-scrape-failures, tarea 1 — Bug condition exploration.
 * Property 1: Bug Condition - Fallas de scrape no clasificadas ni visibles.
 *
 * Estos tests codifican el comportamiento ESPERADO (Expected Behavior 2.1-2.7)
 * con `resilience` activa. DEBEN FALLAR en código sin corregir: cada fallo es un
 * contraejemplo que confirma el bug. Sin red real: transporte falso y
 * `random`/`sleep` inyectables.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { scrapeTicketmaster } from "../src/acquisition/orchestrator.js";
import { TicketmasterHttpClient, type HttpTransport } from "../src/acquisition/http.js";
import { executePersistedTicketmasterScrape, PersistedRunError } from "../src/persistence/workflow.js";
import type { EventPersistence, FinishRunInput, ScrapeErrorInput } from "@mishow/scraper-core";

const listingFixture = readFileSync(new URL("./fixtures/ticketmaster-listing.html", import.meta.url), "utf8");
const detailStartDate = readFileSync(new URL("./fixtures/ticketmaster-detail-startdate.html", import.meta.url), "utf8");
const detailDescription = readFileSync(new URL("./fixtures/ticketmaster-detail-description.html", import.meta.url), "utf8");
const cliSource = readFileSync(new URL("../src/cli/ticketmaster-scrape.ts", import.meta.url), "utf8");

const LISTING = "https://www.ticketmaster.cl/page/musica";
const DETAIL_A = "https://www.ticketmaster.cl/event/lucybell-teatro-caupolican";
const DETAIL_B = "https://www.ticketmaster.cl/event/los-bunkers-movistar-arena";

// `resilience` aún no existe en el código sin corregir: se pasa con cast y es ignorada.
const resilience = { classifyBlocking: true, jitterRatio: 0.5, minListingRefs: 10, degradedRatio: 0.25, failedRatio: 0.75 };
const config = { resilience } as never;

const html = (status: number, body: string) => ({ status, body, headers: { "content-type": "text/html; charset=utf-8" } });
const now = () => new Date("2026-09-08T12:00:00.000Z");

function makeClient(transport: HttpTransport, sleeps: number[] = [], random: () => number = () => 0.5) {
  return new TicketmasterHttpClient({
    transport,
    sleep: async (ms: number) => { sleeps.push(ms); },
    config,
    random
  } as never);
}

function memoryPersistence() {
  const errors: ScrapeErrorInput[] = [];
  const finished: FinishRunInput[] = [];
  const persistence: EventPersistence = {
    startRun: async () => ({ run_id: "run-1", status: "running" }),
    persistEvent: async () => ({ event_id: "e", warnings: [] }),
    recordError: async (_id, error) => { errors.push(error); },
    finishRun: async (_id, result) => { finished.push(result); }
  };
  return { persistence, errors, finished };
}

const start = { source: "ticketmaster", listing_url: LISTING, started_at: now().toISOString(), parameters: {} };

describe("Ticketmaster bug condition (debe FALLAR en código sin corregir)", () => {
  it("1.1 listado 403 -> error `blocked` con http_status=403, stage=listing y attempts", async () => {
    const client = makeClient(async () => html(403, "<html>Forbidden</html>"));
    const error = await scrapeTicketmaster({ client, config, now } as never).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    // Hoy: Error("http_error: HTTP 403.") plano, sin status ni etapa.
    expect((error as { code?: string }).code).toBe("blocked");
    expect((error as { httpStatus?: number }).httpStatus).toBe(403);
    expect((error as { stage?: string }).stage).toBe("listing");
    expect((error as { attempts?: number }).attempts).toBe(1);
  });

  it("1.1 detalle 403 -> ScrapeError `blocked` con http_status=403", async () => {
    const transport: HttpTransport = async ({ url }) => {
      if (url === LISTING) return html(200, listingFixture);
      if (url === DETAIL_A) return html(403, "forbidden");
      return html(200, detailDescription);
    };
    const result = await scrapeTicketmaster({ client: makeClient(transport), config, now } as never);
    const err = result.errors.find((e) => e.source_url === DETAIL_A);
    expect(err?.code).toBe("blocked"); // hoy: http_error
    expect((err as { http_status?: number }).http_status).toBe(403);
  });

  it("1.2 redirección a /queue -> `blocked_redirect`/`challenge` conservando source_url", async () => {
    const transport: HttpTransport = async ({ url }) => {
      if (url === LISTING) return html(200, listingFixture);
      if (url === DETAIL_A) return { status: 302, body: "", headers: { location: "https://www.ticketmaster.cl/queue/wait" } };
      return html(200, detailDescription);
    };
    const result = await scrapeTicketmaster({ client: makeClient(transport), config, now } as never);
    const err = result.errors.find((e) => e.source_url === DETAIL_A);
    expect(["blocked_redirect", "challenge"]).toContain(err?.code); // hoy: redirect_rejected
  });

  it("1.3 listado HTML válido sin div.grid_element -> `listing_empty`, nunca succeeded", async () => {
    const transport: HttpTransport = async () => html(200, "<html><body><h1>Música</h1></body></html>");
    const client = makeClient(transport);
    const { persistence, errors, finished } = memoryPersistence();
    const outcome = await executePersistedTicketmasterScrape({
      persistence, start, now,
      scrape: () => scrapeTicketmaster({ client, config, now } as never)
    }).catch((e) => e);
    // Hoy: resuelve con status "succeeded" (0 descubiertos, 0 fallidos).
    expect(outcome).toBeInstanceOf(PersistedRunError);
    expect(finished[0]?.status).not.toBe("succeeded");
    expect(errors.map((e) => e.code)).toContain("listing_empty");
  });

  it("1.4 50% de detalles sin JSON-LD -> health degraded, partial y failure_breakdown", async () => {
    const transport: HttpTransport = async ({ url }) => {
      if (url === LISTING) return html(200, listingFixture);
      if (url === DETAIL_A) return html(200, detailStartDate);
      if (url === DETAIL_B) return html(200, "<html><body>sin json-ld</body></html>");
      throw new Error(`unexpected ${url}`);
    };
    const client = makeClient(transport);
    const { persistence, finished } = memoryPersistence();
    const result = await executePersistedTicketmasterScrape({
      persistence, start, now,
      scrape: () => scrapeTicketmaster({ client, config: { resilience: { ...resilience, minListingRefs: 1 } } as never, now } as never)
    });
    const summary = result.summary as Record<string, unknown>;
    expect(summary.failure_breakdown).toBeDefined(); // hoy: ausente
    expect((result as unknown as { health?: string }).health ?? (summary as { health?: string }).health).toBe("degraded");
    expect(finished[0]?.status).toBe("partial");
  });

  it("1.5 dos 503 -> backoff con jitter acotado (no 1000/2000 exactos) y ≤ maxRetryAfterMs", async () => {
    const run = async (random: () => number) => {
      const sleeps: number[] = [];
      let calls = 0;
      const transport: HttpTransport = async () => {
        calls += 1;
        return calls <= 2 ? html(503, "busy") : html(200, "<html></html>");
      };
      await makeClient(transport, sleeps, random).getHtml(LISTING, "listing").catch(() => undefined);
      return sleeps;
    };
    const low = await run(() => 0);
    const high = await run(() => 1);
    // Hoy: ambos son idénticos (…1000…2000 deterministas), el random inyectado se ignora.
    expect(low).not.toEqual(high);
    for (const ms of [...low, ...high]) {
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThanOrEqual(30000);
    }
  });

  it("1.6 partial -> política de salida D3 en el CLI (::warning:: y TM_FAIL_ON_PARTIAL)", () => {
    // Hoy: solo `status === "failed"` fija exitCode; partial sale 0 sin anotación.
    expect(cliSource).toContain("TM_FAIL_ON_PARTIAL");
    expect(cliSource).toContain("::warning::");
  });

  it("1.7 falla global -> registra code/stage reales, no `global_acquisition_failure` ni attempts fijo", async () => {
    const client = makeClient(async () => html(403, "forbidden"));
    const { persistence, errors } = memoryPersistence();
    await executePersistedTicketmasterScrape({
      persistence, start, now,
      scrape: () => scrapeTicketmaster({ client, config, now } as never)
    }).catch(() => undefined);
    expect(errors).toHaveLength(1);
    // Hoy: { stage: "listing", code: "global_acquisition_failure", attempts: 1 }.
    expect(errors[0].code).not.toBe("global_acquisition_failure");
    expect(errors[0].code).toBe("blocked");
    expect(errors[0].message).toMatch(/403/);
  });
});
