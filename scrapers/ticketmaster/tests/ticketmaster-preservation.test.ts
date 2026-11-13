/**
 * Property 2: Preservation (spec ticketmaster-scrape-failures, tarea 2).
 *
 * Línea base observada en código SIN corregir. Estos tests deben pasar antes y
 * después del fix. Sin red real: transporte falso y `sleep` inyectado.
 * El repo no incluye fast-check, así que las propiedades usan un PRNG con semilla
 * fija (reproducible) sobre muchas combinaciones generadas.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TicketmasterHttpClient, HttpAcquisitionError, type HttpTransport } from "../src/acquisition/http.js";
import { scrapeTicketmaster } from "../src/acquisition/orchestrator.js";
import { acquisitionConfig, validateAcquisitionUrl } from "../src/acquisition/policy.js";
import { executePersistedTicketmasterScrape } from "../src/persistence/workflow.js";
import type { EventPersistence, ScrapeErrorInput, FinishRunInput } from "@mishow/scraper-core";
import type { NormalizedEvent } from "@mishow/domain";

const detailA = readFileSync(new URL("./fixtures/ticketmaster-detail-startdate.html", import.meta.url), "utf8");
const detailB = readFileSync(new URL("./fixtures/ticketmaster-detail-description.html", import.meta.url), "utf8");

const RUNS = 25;
const BASE = "https://www.ticketmaster.cl";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

function listingHtml(slugs: string[]): string {
  return slugs.map((slug) => `<div class='grid_element'><a href='../event/${slug}'><span class='item_title'>${slug}</span></a></div>`).join("\n");
}
const res = (status: number, body = "", headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" }) => ({ status, body, headers });

interface Harness {
  transport: HttpTransport;
  sleeps: number[];
  calls: string[];
  maxInFlight: () => number;
  requests: Array<{ timeoutMs: number; maxBytes: number; headers: Record<string, string> }>;
}

function harness(handler: (url: string, call: number) => ReturnType<typeof res> | Error): Harness {
  const sleeps: number[] = [];
  const calls: string[] = [];
  const requests: Harness["requests"] = [];
  let inFlight = 0;
  let max = 0;
  const transport: HttpTransport = async (request) => {
    calls.push(request.url);
    requests.push({ timeoutMs: request.timeoutMs, maxBytes: request.maxBytes, headers: request.headers });
    inFlight += 1;
    max = Math.max(max, inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    inFlight -= 1;
    const out = handler(request.url, calls.filter((url) => url === request.url).length);
    if (out instanceof Error) throw out;
    return out;
  };
  return { transport, sleeps, calls, requests, maxInFlight: () => max };
}

function client(h: Harness, config?: Parameters<typeof acquisitionConfig>[0]) {
  return new TicketmasterHttpClient({ transport: h.transport, config, sleep: async (ms) => { h.sleeps.push(ms); } });
}

class MemoryPersistence implements EventPersistence {
  readonly store = new Map<string, NormalizedEvent>();
  readonly errors: ScrapeErrorInput[] = [];
  finished: FinishRunInput[] = [];
  async startRun() { return { run_id: "1", status: "running" as const }; }
  async persistEvent(_run: string, event: NormalizedEvent) {
    this.store.set(`${event.source}:${event.source_url}`, event); // upsert idempotente por fuente+URL
    return { event_id: String(this.store.size), warnings: [] };
  }
  async recordError(_run: string, error: ScrapeErrorInput) { this.errors.push(error); }
  async finishRun(_run: string, result: FinishRunInput) { this.finished.push(result); }
}

async function runPersisted(h: Harness, persistence: MemoryPersistence, config?: Parameters<typeof acquisitionConfig>[0]) {
  const c = client(h, config);
  return executePersistedTicketmasterScrape({
    persistence,
    start: { source: "ticketmaster", listing_url: `${BASE}/page/musica`, started_at: "2026-09-08T12:00:00.000Z", parameters: {} },
    scrape: () => scrapeTicketmaster({ client: c, config, now: () => new Date("2026-09-08T12:00:00.000Z") }),
    now: () => new Date("2026-09-08T12:00:10.000Z")
  });
}

describe("Preservation: corrida sana de Ticketmaster (3.1, 3.2, 3.4)", () => {
  it("extrae, normaliza y persiste con source y source_url originales; idempotente por fuente+URL", async () => {
    for (let i = 0; i < RUNS; i += 1) {
      const r = rng(1000 + i);
      const n = int(r, 1, 8);
      const slugs = Array.from({ length: n }, (_, k) => `evento-${i}-${k}`);
      const variant = new Map(slugs.map((slug) => [slug, r() < 0.5 ? "A" : "B"] as const));
      const h = harness((url) => {
        if (url === `${BASE}/page/musica`) return res(200, listingHtml(slugs));
        const slug = url.split("/event/")[1];
        return res(200, variant.get(slug) === "A" ? detailA : detailB);
      });
      const persistence = new MemoryPersistence();
      const result = await runPersisted(h, persistence);

      expect(result.status).toBe("succeeded");
      expect(result.summary).toEqual({ discovered: n, attempted: n, succeeded: n, failed: 0 });
      expect(result.errors).toEqual([]);
      expect(result.events.map((e) => e.source_url)).toEqual(slugs.map((s) => `${BASE}/event/${s}`));
      for (const event of result.events) {
        expect(event.source).toBe("ticketmaster");
        const v = variant.get(event.source_url.split("/event/")[1]);
        const perf = event.performances[0];
        expect(perf.timezone).toBe("America/Santiago");
        if (v === "A") {
          expect(perf.starts_at).toBe("2026-11-15T21:00:00-03:00"); // offset explícito
          expect(perf).not.toHaveProperty("time_known");
        } else {
          expect(perf.starts_at).toBe("2026-12-20T00:00:00-03:00"); // date-only
          expect(perf.time_known).toBe(false);
        }
      }
      expect(persistence.store.size).toBe(n);

      // Reejecución: mismas claves, sin duplicados.
      const again = await runPersisted(harnessFrom(h), persistence);
      expect(again.status).toBe("succeeded");
      expect(persistence.store.size).toBe(n);
    }
  });
});

function harnessFrom(previous: Harness): Harness {
  // Mismo comportamiento de respuestas: reutiliza el transporte con contadores nuevos.
  return { ...previous, sleeps: [], calls: [] };
}

describe("Preservation: límites de política en requests (3.3)", () => {
  it("concurrencia ≤ 2, delay 1500 ms (≥ 1000), timeout 15 s ≤ 30 s, 2 MiB, mismo User-Agent", async () => {
    for (let i = 0; i < RUNS; i += 1) {
      const r = rng(2000 + i);
      const n = int(r, 1, 10);
      const slugs = Array.from({ length: n }, (_, k) => `ev-${i}-${k}`);
      const h = harness((url) => (url.endsWith("/page/musica") ? res(200, listingHtml(slugs)) : res(200, detailA)));
      await runPersisted(h, new MemoryPersistence());
      expect(h.maxInFlight()).toBeLessThanOrEqual(2);
      expect(h.sleeps.length).toBe(n + 1);
      expect(h.sleeps.every((ms) => ms === 1500 && ms >= 1000)).toBe(true);
      for (const req of h.requests) {
        expect(req.timeoutMs).toBe(15000);
        expect(req.timeoutMs).toBeLessThanOrEqual(30000);
        expect(req.maxBytes).toBe(2 * 1024 * 1024);
        expect(req.headers["User-Agent"]).toBe("miShow-ticketmaster-acquisition/0.1");
      }
      expect(h.calls.every((url) => url.startsWith(`${BASE}/`))).toBe(true);
    }
  });

  it("rechaza configuraciones fuera de rango y acepta los bordes", () => {
    for (const bad of [{ concurrency: 3 }, { concurrency: 0 }, { delayMs: 999 }, { timeoutMs: 30001 }, { timeoutMs: 0 }, { retries: 3 }, { redirects: 4 }, { maxHtmlBytes: 2 * 1024 * 1024 + 1 }, { maxEvents: 201 }, { maxEvents: -1 }, { listingUrl: "http://www.ticketmaster.cl/page/musica" }, { listingUrl: "https://user:pass@www.ticketmaster.cl/page/musica" }, { listingUrl: "https://www.ticketmaster.cl/page/deportes" }]) {
      expect(() => acquisitionConfig(bad)).toThrow();
    }
    expect(acquisitionConfig({ concurrency: 2, delayMs: 1000, timeoutMs: 30000, retries: 2, redirects: 3, maxEvents: 200, maxHtmlBytes: 2 * 1024 * 1024 })).toMatchObject({ concurrency: 2, delayMs: 1000 });
    expect(acquisitionConfig()).toMatchObject({ concurrency: 2, delayMs: 1500, timeoutMs: 15000, retries: 2, redirects: 3, maxHtmlBytes: 2 * 1024 * 1024 });
  });

  it("rechaza HTTP, otros hosts, credenciales y rutas bloqueadas de detalle", () => {
    const blocked = ["account", "login", "register", "cart", "checkout", "purchase", "payment", "api/x", "queue/abc", "search", "tickets", "comprar", "page/musica"];
    for (const path of blocked) {
      expect(() => validateAcquisitionUrl(`${BASE}/${path}`, "detail")).toThrow();
    }
    for (const url of ["http://www.ticketmaster.cl/event/a", "https://ticketmaster.cl/event/a", "https://www.ticketmaster.cl:8443/event/a", "https://u:p@www.ticketmaster.cl/event/a", "https://www.ticketmaster.cl/event/%2e%2e%2fadmin"]) {
      expect(() => validateAcquisitionUrl(url, "detail")).toThrow();
    }
  });

  it("máximo 3 redirecciones: 3 se siguen, la 4ª falla con too_many_redirects; Location a otro host es redirect_rejected", async () => {
    const chain = (hops: number) => harness((url) => {
      if (url === `${BASE}/event/h0` || /\/event\/h\d+$/.test(url)) {
        const k = Number(url.split("/h")[1]);
        if (k < hops) return { status: 302, body: "", headers: { location: `${BASE}/event/h${k + 1}` } };
        return res(200, detailA);
      }
      return res(404);
    });
    const ok = chain(3);
    await expect(client(ok).getHtml(`${BASE}/event/h0`, "detail")).resolves.toContain("Lucybell");
    const tooMany = chain(4);
    await expect(client(tooMany).getHtml(`${BASE}/event/h0`, "detail")).rejects.toMatchObject({ code: "too_many_redirects" });
    const external = harness(() => ({ status: 302, body: "", headers: { location: "https://evil.example/event/x" } }));
    await expect(client(external).getHtml(`${BASE}/event/h0`, "detail")).rejects.toMatchObject({ code: "redirect_rejected" });
  });

  it("rechaza HTML sobre 2 MiB con response_too_large", async () => {
    const big = "a".repeat(2 * 1024 * 1024 + 1);
    const h = harness(() => res(200, big));
    await expect(client(h).getHtml(`${BASE}/event/x`, "detail")).rejects.toMatchObject({ code: "response_too_large" });
  });
});

describe("Preservation: MAX_EVENTS (3.7)", () => {
  it("procesa como máximo maxEvents referencias del listado", async () => {
    for (let i = 0; i < RUNS; i += 1) {
      const r = rng(3000 + i);
      const total = int(r, 1, 9);
      const max = int(r, 0, 10);
      const slugs = Array.from({ length: total }, (_, k) => `m-${i}-${k}`);
      const h = harness((url) => (url.endsWith("/page/musica") ? res(200, listingHtml(slugs)) : res(200, detailA)));
      const result = await scrapeTicketmaster({ client: client(h, { maxEvents: max }), config: { maxEvents: max }, now: () => new Date("2026-09-08T12:00:00.000Z") });
      const expected = Math.min(total, max);
      expect(result.summary).toEqual({ discovered: total, attempted: expected, succeeded: expected, failed: 0 });
      expect(h.calls.length).toBe(1 + expected);
    }
  });
});

describe("Preservation: un evento fallido no detiene a los demás (3.5, 3.6)", () => {
  it("persiste los exitosos, registra errores por evento con su source_url y calcula status", async () => {
    for (let i = 0; i < RUNS; i += 1) {
      const r = rng(4000 + i);
      const n = int(r, 1, 7);
      const slugs = Array.from({ length: n }, (_, k) => `f-${i}-${k}`);
      const kinds = slugs.map(() => (r() < 0.5 ? "ok" : r() < 0.5 ? "404" : "410"));
      const h = harness((url) => {
        if (url.endsWith("/page/musica")) return res(200, listingHtml(slugs));
        const kind = kinds[slugs.indexOf(url.split("/event/")[1])];
        return kind === "ok" ? res(200, detailA) : res(Number(kind));
      });
      const persistence = new MemoryPersistence();
      const result = await runPersisted(h, persistence);
      const okCount = kinds.filter((k) => k === "ok").length;
      const failCount = n - okCount;

      expect(persistence.store.size).toBe(okCount);
      expect(result.summary).toMatchObject({ discovered: n, attempted: n, succeeded: okCount, failed: failCount });
      expect(result.status).toBe(failCount === 0 ? "succeeded" : okCount === 0 ? "failed" : "partial");
      const detailErrors = result.errors.filter((e) => e.code === "http_error");
      expect(detailErrors).toHaveLength(failCount);
      for (const error of detailErrors) {
        expect(error).toMatchObject({ stage: "detail", attempts: 1 });
        expect(slugs.some((s) => (error as { source_url?: string }).source_url === `${BASE}/event/${s}`)).toBe(true);
      }
      expect(persistence.errors.filter((e) => e.code === "http_error")).toHaveLength(failCount);
      expect(persistence.finished[0].status).toBe(result.status);
    }
  });

  it("no expone credenciales en los errores registrados", async () => {
    const slugs = ["cred-1", "cred-2"];
    const h = harness((url) => {
      if (url.endsWith("/page/musica")) return res(200, listingHtml(slugs));
      return new Error("falla https://user:s3cret@www.ticketmaster.cl/event/x");
    });
    const persistence = new MemoryPersistence();
    const result = await runPersisted(h, persistence, { retries: 0 });
    const dump = JSON.stringify([result.errors, persistence.errors]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(dump).not.toContain("s3cret");
    expect(dump).not.toContain("user:");
  });
});

describe("Preservation: errores HTTP no reintentables y reintentos acotados (3.3)", () => {
  it("4xx no reintentables (404/410) fallan con http_error en el primer intento", async () => {
    for (const status of [404, 410]) {
      const h = harness(() => res(status));
      const error = await client(h).getHtml(`${BASE}/event/x`, "detail").catch((e) => e);
      expect(error).toBeInstanceOf(HttpAcquisitionError);
      expect(error).toMatchObject({ code: "http_error", attempts: 1, message: `HTTP ${status}.` });
      expect(h.calls).toHaveLength(1);
    }
  });

  it("estados reintentables (408/429/5xx) se reintentan como máximo 2 veces (3 intentos) y luego fallan", async () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      const h = harness(() => res(status));
      const error = await client(h).getHtml(`${BASE}/event/x`, "detail").catch((e) => e);
      expect(error).toMatchObject({ code: "http_error", attempts: 3, message: `HTTP ${status}.` });
      expect(h.calls).toHaveLength(3);
    }
  });

  it("Retry-After se respeta acotado a maxRetryAfterMs (30 s)", async () => {
    const h = harness((_url, call) => (call === 1 ? res(503, "", { "content-type": "text/html", "retry-after": "999" }) : res(200, detailA)));
    await client(h).getHtml(`${BASE}/event/x`, "detail");
    expect(h.sleeps).toContain(30000);
    expect(Math.max(...h.sleeps)).toBe(30000);
  });
});
