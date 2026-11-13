/**
 * Property 2: Preservation de PuntoTicket (spec ticketmaster-scrape-failures, tarea 2).
 *
 * El core es compartido: PuntoTicket no activa `resilience`, así que su
 * comportamiento actual debe quedar idéntico tras el fix. Línea base observada
 * en código SIN corregir. PRNG con semilla fija (el repo no incluye fast-check).
 *
 * **Validates: Requirements 3.6**
 */
import { describe, expect, it } from "vitest";
import { PuntoTicketHttpClient, type HttpTransport } from "../src/acquisition/http.js";
import { scrapePuntoTicket } from "../src/acquisition/orchestrator.js";
import { executePersistedScrape, type EventPersistence, type FinishRunInput, type ScrapeErrorInput } from "@mishow/scraper-core";
import type { NormalizedEvent } from "@mishow/domain";

const BASE = "https://www.puntoticket.com";
const RUNS = 25;
const detailHtml = `<h1>Evento</h1><script type="application/ld+json">{"@type":"Event","name":"Evento","startDate":"2026-12-12T20:00:00-03:00","offers":{"url":"/queue/enqueue/CLI"}}</script>`;

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
const res = (status: number, body = "", headers: Record<string, string> = { "content-type": "text/html" }) => ({ status, body, headers });
const listing = (slugs: string[]) => slugs.map((s) => `<a href="/evento/${s}"><h3>${s}</h3></a>`).join("\n");

function setup(handler: (url: string, call: number) => ReturnType<typeof res>) {
  const sleeps: number[] = [];
  const calls: string[] = [];
  const transport: HttpTransport = async (request) => {
    calls.push(request.url);
    return handler(request.url, calls.filter((u) => u === request.url).length);
  };
  const client = new PuntoTicketHttpClient({ transport, sleep: async (ms) => { sleeps.push(ms); } });
  return { client, sleeps, calls };
}

class MemoryPersistence implements EventPersistence {
  readonly store = new Map<string, NormalizedEvent>();
  readonly errors: ScrapeErrorInput[] = [];
  readonly finished: FinishRunInput[] = [];
  async startRun() { return { run_id: "1", status: "running" as const }; }
  async persistEvent(_run: string, event: NormalizedEvent) {
    this.store.set(`${event.source}:${event.source_url}`, event);
    return { event_id: "1", warnings: [] };
  }
  async recordError(_run: string, error: ScrapeErrorInput) { this.errors.push(error); }
  async finishRun(_run: string, result: FinishRunInput) { this.finished.push(result); }
}

function persisted(client: PuntoTicketHttpClient, persistence: MemoryPersistence) {
  return executePersistedScrape({
    persistence,
    start: { source: "puntoticket", listing_url: `${BASE}/musica`, started_at: "2026-09-08T12:00:00.000Z", parameters: {} },
    scrape: () => scrapePuntoTicket({ client, now: () => new Date("2026-09-08T12:00:00.000Z") }),
    now: () => new Date("2026-09-08T12:00:10.000Z")
  });
}

describe("Preservation PuntoTicket: errores del listado (sin resilience)", () => {
  it("401/403/404 del listado → http_error sin reintento y falla global con código genérico", async () => {
    for (const status of [400, 401, 403, 404, 410]) {
      const { client, calls } = setup(() => res(status));
      const persistence = new MemoryPersistence();
      await expect(persisted(client, persistence)).rejects.toMatchObject({ message: `http_error: HTTP ${status}.` });
      expect(calls).toHaveLength(1);
      expect(persistence.errors).toEqual([
        { stage: "listing", severity: "error", code: "global_acquisition_failure", message: `http_error: HTTP ${status}.`, attempts: 1 }
      ]);
      expect(persistence.finished[0]).toMatchObject({ status: "failed", discovered_count: 0, attempted_count: 0, succeeded_count: 0, failed_count: 0 });
    }
  });

  it("listado válido con 0 referencias → status succeeded con 0/0", async () => {
    for (const body of ["<html><body><p>sin eventos</p></body></html>", "<div>nada</div>", ""]) {
      const { client } = setup(() => res(200, body));
      const persistence = new MemoryPersistence();
      const result = await persisted(client, persistence);
      expect(result.status).toBe("succeeded");
      expect(result.summary).toEqual({ discovered: 0, attempted: 0, succeeded: 0, failed: 0 });
      expect(result.errors).toEqual([]);
      expect(persistence.finished[0].status).toBe("succeeded");
    }
  });

  it("redirección del listado a ruta bloqueada → redirect_rejected; Content-Type ausente → invalid_content_type", async () => {
    const redirect = setup(() => ({ status: 302, body: "", headers: { location: `${BASE}/queue/x` } }));
    await expect(redirect.client.getHtml(`${BASE}/musica`, "listing")).rejects.toMatchObject({ code: "redirect_rejected" });
    const noType = setup(() => ({ status: 200, body: "x", headers: {} }));
    await expect(noType.client.getHtml(`${BASE}/musica`, "listing")).rejects.toMatchObject({ code: "invalid_content_type" });
  });
});

describe("Preservation PuntoTicket: backoff lineal sin jitter", () => {
  it("503 transitorios → esperas exactas 1000/2000 ms entre intentos (delay base 1500 ms)", async () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      const one = setup((_u, call) => (call === 1 ? res(status) : res(200, detailHtml)));
      await one.client.getHtml(`${BASE}/evento/x`, "detail");
      expect(one.sleeps).toEqual([1500, 1000, 1500]);

      const two = setup((_u, call) => (call <= 2 ? res(status) : res(200, detailHtml)));
      await two.client.getHtml(`${BASE}/evento/x`, "detail");
      expect(two.sleeps).toEqual([1500, 1000, 1500, 2000, 1500]);

      const exhausted = setup(() => res(status));
      await expect(exhausted.client.getHtml(`${BASE}/evento/x`, "detail")).rejects.toMatchObject({ code: "http_error", attempts: 3 });
      expect(exhausted.sleeps).toEqual([1500, 1000, 1500, 2000, 1500]);
    }
  });

  it("timeout/error de red se reintenta con el mismo backoff y falla con el código de transporte", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const client = new PuntoTicketHttpClient({
      transport: async () => { calls += 1; throw new Error("boom"); },
      sleep: async (ms) => { sleeps.push(ms); }
    });
    await expect(client.getHtml(`${BASE}/evento/x`, "detail")).rejects.toMatchObject({ code: "network_error", attempts: 3 });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1500, 1000, 1500, 2000, 1500]);
  });
});

describe("Preservation PuntoTicket: estado de corrida y salida", () => {
  it("succeeded / partial / failed según detalles; los eventos válidos se persisten; errores por evento sin cambios", async () => {
    for (let i = 0; i < RUNS; i += 1) {
      const r = rng(5000 + i);
      const n = int(r, 1, 6);
      const slugs = Array.from({ length: n }, (_, k) => `ev${i}x${k}`);
      const kinds = slugs.map(() => (r() < 0.5 ? "ok" : "404"));
      const { client } = setup((url) => {
        if (url === `${BASE}/musica`) return res(200, listing(slugs));
        const kind = kinds[slugs.indexOf(url.split("/evento/")[1])];
        return kind === "ok" ? res(200, detailHtml) : res(404);
      });
      const persistence = new MemoryPersistence();
      const result = await persisted(client, persistence);
      const ok = kinds.filter((k) => k === "ok").length;
      const failed = n - ok;
      expect(result.status).toBe(failed === 0 ? "succeeded" : ok === 0 ? "failed" : "partial");
      expect(result.summary).toMatchObject({ discovered: n, attempted: n, succeeded: ok, failed });
      expect(persistence.store.size).toBe(ok);
      const errs = result.errors.filter((e) => e.code === "http_error");
      expect(errs).toHaveLength(failed);
      for (const e of errs) expect(e).toMatchObject({ stage: "detail", attempts: 1, message: "HTTP 404." });
      expect(result.events.every((e) => e.source === "puntoticket")).toBe(true);
      expect(persistence.finished[0]).toMatchObject({ status: result.status, succeeded_count: ok, failed_count: failed });
    }
  });

  it("reejecutar sobre los mismos eventos no duplica (idempotencia por fuente+URL)", async () => {
    const slugs = ["a1", "b2", "c3"];
    const mk = () => setup((url) => (url === `${BASE}/musica` ? res(200, listing(slugs)) : res(200, detailHtml)));
    const persistence = new MemoryPersistence();
    await persisted(mk().client, persistence);
    await persisted(mk().client, persistence);
    expect(persistence.store.size).toBe(3);
  });
});
