import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PuntoTicketHttpClient, type HttpTransport, HttpAcquisitionError } from "../src/puntoticket/acquisition/http.js";
import { scrapePuntoTicket } from "../src/puntoticket/acquisition/orchestrator.js";
import { acquisitionConfig, validateAcquisitionUrl } from "../src/puntoticket/acquisition/policy.js";
import { parseMusicListing } from "../src/puntoticket/extraction/listing.js";

const eventA = detailHtml("Evento A", "2026-12-12T20:00:00-03:00", "A");
const eventB = detailHtml("Evento B", "2026-12-13T20:00:00-03:00", "B");

describe("PuntoTicket acquisition policy", () => {
  it("allows the approved listing, canonical event details and discovered root landings", () => {
    expect(validateAcquisitionUrl("https://www.puntoticket.com/musica", "listing")).toBe("https://www.puntoticket.com/musica");
    expect(validateAcquisitionUrl("https://www.puntoticket.com/musica/", "listing")).toBe("https://www.puntoticket.com/musica/");
    expect(validateAcquisitionUrl("https://www.puntoticket.com/evento/ABC-123", "detail")).toBe("https://www.puntoticket.com/evento/ABC-123");
    expect(validateAcquisitionUrl("https://www.puntoticket.com/maria-becerra", "detail", undefined, { discoveredDetailUrl: "https://www.puntoticket.com/maria-becerra?ref=listing" })).toBe("https://www.puntoticket.com/maria-becerra");
  });

  it("rejects unsafe URLs, similar hosts, non-standard ports, userinfo, arbitrary root landings and blocked routes", () => {
    for (const [url, stage] of [
      ["http://www.puntoticket.com/musica", "listing"],
      ["https://www.puntoticket.com.attacker.example/musica", "listing"],
      ["https://user@www.puntoticket.com/musica", "listing"],
      ["https://:pass@www.puntoticket.com/musica", "listing"],
      ["https://user:pass@www.puntoticket.com/musica", "listing"],
      ["https://www.puntoticket.com:8443/musica", "listing"],
      ["https://www.puntoticket.com/queue/enqueue/BUY", "detail"],
      ["https://www.puntoticket.com/deportes", "detail"],
      ["https://www.puntoticket.com/%71ueue/enqueue/BUY", "detail"],
      ["https://www.puntoticket.com/%2e%2e/account", "detail"],
      ["https://www.puntoticket.com/maria-becerra", "detail"]
    ] as const) {
      expect(() => validateAcquisitionUrl(url, stage)).toThrow();
    }
  });

  it("keeps configuration inside the approved ranges", () => {
    expect(acquisitionConfig({ maxEvents: 50, concurrency: 2, delayMs: 1000, timeoutMs: 30000 })).toMatchObject({ maxEvents: 50, concurrency: 2 });
    for (const config of [
      { maxEvents: 51 },
      { concurrency: 3 },
      { delayMs: 999 },
      { timeoutMs: 30001 },
      { retries: 3 },
      { redirects: 4 }
    ]) {
      expect(() => acquisitionConfig(config)).toThrow();
    }
  });
});

describe("PuntoTicket HTTP acquisition client", () => {
  it("uses minimal headers, manual redirects and validates redirected locations before fetching them", async () => {
    const calls: string[] = [];
    const client = new PuntoTicketHttpClient({
      transport: async (request) => {
        calls.push(request.url);
        expect(request.headers).toEqual({ Accept: "text/html, application/xhtml+xml", "User-Agent": "miShow-puntoticket-acquisition/0.1" });
        if (calls.length === 1) return response(302, "", { location: "/evento/SAFE" });
        return response(200, eventA);
      },
      sleep: async () => undefined
    });
    await expect(client.getHtml("https://www.puntoticket.com/evento/REDIRECT", "detail")).resolves.toBe(eventA);
    expect(calls).toEqual(["https://www.puntoticket.com/evento/REDIRECT", "https://www.puntoticket.com/evento/SAFE"]);
  });

  it("rejects redirects to external hosts, blocked routes and excessive chains", async () => {
    for (const location of ["https://evil.example/evento/X", "/queue/enqueue/BUY", "/comprar/evento/FNA387/cal/1"]) {
      const client = new PuntoTicketHttpClient({ transport: async () => response(302, "", { location }), sleep: async () => undefined });
      await expect(client.getHtml("https://www.puntoticket.com/evento/X", "detail")).rejects.toMatchObject({ code: "redirect_rejected" });
    }
    const looping = new PuntoTicketHttpClient({ config: { redirects: 1 }, transport: async () => response(302, "", { location: "/evento/NEXT" }), sleep: async () => undefined });
    await expect(looping.getHtml("https://www.puntoticket.com/evento/X", "detail")).rejects.toMatchObject({ code: "too_many_redirects" });
  });

  it("validates MIME type and response size without retrying deterministic failures", async () => {
    const invalidMime = new PuntoTicketHttpClient({ transport: async () => response(200, "<html/>", { "content-type": "application/json" }), sleep: async () => undefined });
    await expect(invalidMime.getHtml("https://www.puntoticket.com/musica", "listing")).rejects.toMatchObject({ code: "invalid_content_type", attempts: 1 });
    const tooLarge = new PuntoTicketHttpClient({ config: { maxHtmlBytes: 10 }, transport: async () => response(200, "01234567890"), sleep: async () => undefined });
    await expect(tooLarge.getHtml("https://www.puntoticket.com/musica", "listing")).rejects.toMatchObject({ code: "response_too_large", attempts: 1 });
  });

  it("retries timeout, network errors, 429 Retry-After and 500 before succeeding", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const client = new PuntoTicketHttpClient({
      transport: async () => {
        calls += 1;
        if (calls === 1) throw new HttpAcquisitionError("timeout", "Timeout de solicitud.", 1);
        if (calls === 2) return response(429, "", { "retry-after": "2" });
        return response(200, eventA);
      },
      sleep: async (ms) => { sleeps.push(ms); }
    });
    await expect(client.getHtml("https://www.puntoticket.com/evento/A", "detail")).resolves.toBe(eventA);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1500, 1000, 1500, 2000, 1500]);

    calls = 0;
    const transient = new PuntoTicketHttpClient({
      transport: async () => (++calls === 1 ? response(500, "") : response(200, eventB)),
      sleep: async () => undefined
    });
    await expect(transient.getHtml("https://www.puntoticket.com/evento/B", "detail")).resolves.toBe(eventB);
  });

  it("stops after the approved retry budget and does not retry permanent HTTP errors", async () => {
    let retryableCalls = 0;
    const retryable = new PuntoTicketHttpClient({ transport: async () => (retryableCalls += 1, response(503, "")), sleep: async () => undefined });
    await expect(retryable.getHtml("https://www.puntoticket.com/evento/A", "detail")).rejects.toMatchObject({ code: "http_error", attempts: 3 });
    expect(retryableCalls).toBe(3);

    let permanentCalls = 0;
    const permanent = new PuntoTicketHttpClient({ transport: async () => (permanentCalls += 1, response(404, "")), sleep: async () => undefined });
    await expect(permanent.getHtml("https://www.puntoticket.com/evento/A", "detail")).rejects.toMatchObject({ code: "http_error", attempts: 1 });
    expect(permanentCalls).toBe(1);
  });
});

describe("PuntoTicket scrape orchestrator", () => {
  it("uses discovered references to fetch canonical and root landing details without requesting rejected links", async () => {
    const listing = `
      <article class="event-card"><a href="/evento/FNA387"><h3>Festival A</h3><time datetime="2026-12-12">12 DIC</time></a></article>
      <article class="event-card"><a href="/maria-becerra"><h3>Maria Becerra</h3><time datetime="2026-12-13">13 DIC</time></a></article>
      <a href="/noticia-suelta"><h3>No es evento</h3></a>
      <article class="event-card"><a href="/musica"><h3>Musica</h3><time datetime="2026-12-14">14 DIC</time></a></article>`;
    expect(parseMusicListing(listing)).toEqual([
      { source_url: "https://www.puntoticket.com/evento/FNA387", title: "Festival A" },
      { source_url: "https://www.puntoticket.com/maria-becerra", title: "Maria Becerra" }
    ]);

    const calls: string[] = [];
    const result = await scrapeWith({
      transport: async (request) => {
        calls.push(request.url);
        if (request.url.endsWith("/musica")) return response(200, listing);
        if (request.url.endsWith("/evento/FNA387")) return response(200, eventA);
        if (request.url.endsWith("/maria-becerra")) return response(200, eventB);
        throw new Error(`unexpected request ${request.url}`);
      }
    });
    expect(calls).toEqual([
      "https://www.puntoticket.com/musica",
      "https://www.puntoticket.com/evento/FNA387",
      "https://www.puntoticket.com/maria-becerra"
    ]);
    expect(result.summary).toEqual({ discovered: 2, attempted: 2, succeeded: 2, failed: 0 });
    expect(result.events.map((event) => event.name)).toEqual(["Evento A", "Evento B"]);
  });

  it("downloads listing and details, reuses parsers, limits max-events and keeps deterministic timestamps", async () => {
    const calls: string[] = [];
    const result = await scrapeWith({
      maxEvents: 1,
      transport: async (request) => {
        calls.push(request.url);
        if (request.url.endsWith("/musica")) return response(200, `<a href="/evento/A"><h3>A</h3></a><a href="/evento/B"><h3>B</h3></a>`);
        return response(200, eventA);
      }
    });
    expect(calls).toEqual(["https://www.puntoticket.com/musica", "https://www.puntoticket.com/evento/A"]);
    expect(result.summary).toEqual({ discovered: 2, attempted: 1, succeeded: 1, failed: 0 });
    expect(result.events[0]).toMatchObject({ source: "puntoticket", name: "Evento A", extracted_at: "2026-09-08T12:00:00.000Z" });
    expect(result.finished_at).toBe("2026-09-08T12:00:10.000Z");
  });

  it("filters blocked discovered references before applying max-events", async () => {
    const listing = `
      <article class="event-card"><a href="/teatro"><h3>Categoria teatro</h3><time datetime="2026-12-11">11 DIC</time></a></article>
      <article class="event-card"><a href="/evento/A"><h3>A</h3><time datetime="2026-12-12">12 DIC</time></a></article>`;
    expect(parseMusicListing(listing).map((reference) => reference.source_url)).toEqual([
      "https://www.puntoticket.com/teatro",
      "https://www.puntoticket.com/evento/A"
    ]);

    const calls: string[] = [];
    const result = await scrapeWith({
      maxEvents: 1,
      transport: async (request) => {
        calls.push(request.url);
        if (request.url.endsWith("/musica")) return response(200, listing);
        if (request.url.endsWith("/evento/A")) return response(200, eventA);
        throw new Error(`unexpected request ${request.url}`);
      }
    });

    expect(calls).toEqual(["https://www.puntoticket.com/musica", "https://www.puntoticket.com/evento/A"]);
    expect(calls).not.toContain("https://www.puntoticket.com/teatro");
    expect(result.summary).toEqual({ discovered: 2, attempted: 1, succeeded: 1, failed: 0 });
    expect(result.events.map((event) => event.name)).toEqual(["Evento A"]);
    expect(result.errors).toEqual([]);
  });

  it("preserves discovery order under concurrency and serializes delay through the global limiter", async () => {
    const sleeps: number[] = [];
    const result = await scrapeWith({
      concurrency: 2,
      sleep: async (ms) => { sleeps.push(ms); },
      transport: async (request) => {
        if (request.url.endsWith("/musica")) return response(200, `<a href="/evento/A"><h3>A</h3></a><a href="/evento/B"><h3>B</h3></a>`);
        return response(200, request.url.endsWith("/B") ? eventB : eventA);
      }
    });
    expect(result.events.map((event) => event.name)).toEqual(["Evento A", "Evento B"]);
    expect(sleeps).toEqual([1500, 1500, 1500]);
  });

  it("records individual detail failures without stopping the run and never follows purchase_url", async () => {
    const calls: string[] = [];
    const result = await scrapeWith({
      transport: async (request) => {
        calls.push(request.url);
        if (request.url.endsWith("/musica")) return response(200, `<a href="/evento/A"><h3>A</h3></a><a href="/evento/MISSING"><h3>Missing</h3></a>`);
        if (request.url.endsWith("/MISSING")) return response(404, "nope");
        return response(200, eventA);
      }
    });
    expect(result.summary).toEqual({ discovered: 2, attempted: 2, succeeded: 1, failed: 1 });
    expect(result.errors).toMatchObject([{ stage: "detail", source_url: "https://www.puntoticket.com/evento/MISSING", code: "http_error" }]);
    expect(calls).not.toContain("https://www.puntoticket.com/queue/enqueue/A");
    expect(calls).not.toContain("https://www.puntoticket.com/comprar/evento/A/cal/1");
  });

  it("treats a listing failure as global failure with no partial JSON result", async () => {
    await expect(scrapeWith({ transport: async () => response(500, "") })).rejects.toThrow("http_error");
  });
});

describe("PuntoTicket scrape CLI", () => {
  it("fails without --live before a real transport can be invoked", () => {
    const result = spawnSync("npm", ["--silent", "run", "puntoticket:scrape", "--", "--max-events", "1"], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--live");
    expect(result.stderr).not.toMatch(/<html|stack|cookie|authorization/i);
  });

  it("reports invalid CLI arguments on stderr only", () => {
    for (const args of [["--live", "--max-events", "51"], ["--live", "--delay-ms", "999"], ["--live", "--listing-url", "https://evil.example/musica"], ["--live", "--unknown", "1"]]) {
      const result = spawnSync("npm", ["--silent", "run", "puntoticket:scrape", "--", ...args], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/Error:/);
    }
  });

  it("emits JSON-only stdout with --live when fetch is injected by the test harness", () => {
    const result = spawnSync("node", ["--import", "tsx/esm", "--import", "./tests/helpers/puntoticket-mock-fetch.ts", "src/cli/puntoticket-scrape.ts", "--live", "--max-events", "1", "--concurrency", "1", "--delay-ms", "1000", "--timeout-ms", "15000"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout);
    expect(output.summary).toEqual({ discovered: 1, attempted: 1, succeeded: 1, failed: 0 });
    expect(output.events[0].name).toBe("Evento CLI");
  });
});

function response(status: number, body: string, headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" }) {
  return { status, body, headers };
}

async function scrapeWith(options: { transport: HttpTransport; maxEvents?: number; concurrency?: number; sleep?: (ms: number) => Promise<void> }) {
  const client = new PuntoTicketHttpClient({
    config: { maxEvents: options.maxEvents, concurrency: options.concurrency },
    transport: options.transport,
    sleep: options.sleep ?? (async () => undefined)
  });
  const dates = [new Date("2026-09-08T12:00:00.000Z"), new Date("2026-09-08T12:00:10.000Z")];
  return scrapePuntoTicket({
    config: { maxEvents: options.maxEvents, concurrency: options.concurrency },
    client,
    now: () => dates.shift() ?? new Date("2026-09-08T12:00:10.000Z")
  });
}

function detailHtml(name: string, startDate: string, code: string): string {
  return `<h1>${name}</h1><script type="application/ld+json">{"@type":"Event","name":"${name}","startDate":"${startDate}","offers":{"url":"/queue/enqueue/${code}","availability":"https://schema.org/InStock"}}</script><a href="/comprar/evento/${code}/cal/1">Comprar</a>`;
}
