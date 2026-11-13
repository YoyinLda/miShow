import { describe, expect, it } from "vitest";
import { createDbVenuesIndex, type VenueSourceRow } from "../src/discovery/db-venues.js";
import { createPuntoticketAdapter } from "../src/adapter.js";
import { scrapePuntoTicket } from "../src/acquisition/orchestrator.js";
import { PuntoTicketHttpClient } from "../src/acquisition/http.js";
import { resolveNotFoundRetryDays, CliUsageError } from "../src/cli/scrape-args.js";
import { runIterations } from "./helpers/prng.js";

const ORIGIN = "https://www.puntoticket.com";
const NOW = new Date("2026-10-09T12:00:00.000Z");
const ctx = { getHtml: async () => "" };
const row = (slug: string, status?: VenueSourceRow["status"], checked?: string | null): VenueSourceRow => ({
  source_slug: slug,
  source_url: `${ORIGIN}/${slug}`,
  ...(status ? { status } : {}),
  ...(checked !== undefined ? { last_checked_at: checked } : {})
});
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("db-venues: estado y orden", () => {
  it("ordena active, candidate (y sin status), y not_found vencidas; omite not_found recientes", async () => {
    const index = createDbVenuesIndex(
      async () => [
        row("c1", "candidate"),
        row("nf-old", "not_found", daysAgo(31)),
        row("a1", "active", daysAgo(1)),
        row("nf-new", "not_found", daysAgo(5)),
        row("c2"),
        row("nf-never", "not_found", null),
        row("a2", "active")
      ],
      { now: () => NOW, notFoundRetryDays: 30 }
    );
    const urls = await index.list(ctx);
    expect(urls.map((u) => u.split("/").pop())).toEqual(["a1", "a2", "c1", "c2", "nf-old", "nf-never"]);
    expect(index.allowedPaths().has("/nf-new")).toBe(false);
  });

  it("notFoundRetryDays=0 reintenta siempre", async () => {
    const index = createDbVenuesIndex(async () => [row("x", "not_found", daysAgo(0))], { now: () => NOW, notFoundRetryDays: 0 });
    expect(await index.list(ctx)).toHaveLength(1);
  });

  // Feature: puntoticket-venue-discovery, Property 17: orden por estado y reintento de not_found
  it("Propiedad 17: nunca incluye not_found vigente y el orden es no decreciente en estado", async () => {
    await runIterations(120, 0x17_0000, async (prng) => {
      const retry = prng.int(0, 60);
      const rows: VenueSourceRow[] = Array.from({ length: prng.int(0, 15) }, (_, i) =>
        row(`v${i}`, prng.pick(["candidate", "active", "not_found", undefined] as const), prng.bool() ? daysAgo(prng.int(0, 90)) : null)
      );
      const index = createDbVenuesIndex(async () => rows, { now: () => NOW, notFoundRetryDays: retry });
      const urls = await index.list(ctx);
      const rank = { active: 0, candidate: 1, not_found: 2 } as const;
      let last = 0;
      for (const url of urls) {
        const r = rows.find((x) => x.source_url === url)!;
        const state = r.status ?? "candidate";
        if (state === "not_found" && r.last_checked_at) {
          expect(NOW.getTime() - Date.parse(r.last_checked_at)).toBeGreaterThanOrEqual(retry * 86_400_000);
        }
        expect(rank[state]).toBeGreaterThanOrEqual(last);
        last = rank[state];
      }
    });
  });
});

describe("db-venues: verificaciones tras la corrida", () => {
  const html = { "content-type": "text/html; charset=utf-8" };
  it("200 => active, 404 => not_found, 500 => sin check", async () => {
    const index = createDbVenuesIndex(async () => [row("ok"), row("gone"), row("boom")]);
    const adapter = createPuntoticketAdapter({ venueIndex: index });
    const transport = async (req: { url: string }) => {
      if (req.url.endsWith("/musica")) return { status: 200, body: "<html></html>", headers: html };
      if (req.url.endsWith("/ok")) return { status: 200, body: "<html></html>", headers: html };
      if (req.url.endsWith("/gone")) return { status: 404, body: "", headers: html };
      return { status: 500, body: "", headers: html };
    };
    const client = new PuntoTicketHttpClient({ transport, sleep: async () => undefined, adapter, config: { retries: 0 } as never });
    await scrapePuntoTicket({
      client,
      now: () => NOW,
      adapter,
      discovery: { enabled: true, maxPages: 10, maxPagesLimit: 10 }
    });
    expect(index.pendingChecks()).toEqual([
      { source_slug: "ok", status: "active" },
      { source_slug: "gone", status: "not_found" }
    ]);
  });

  it("un venue puede tener slugs distintos por ticketera: solo se usan las filas de puntoticket", async () => {
    const index = createDbVenuesIndex(async (source) => (source === "puntoticket" ? [row("slug-pt")] : [row("slug-otro")]));
    expect((await index.list(ctx)).map((u) => u.split("/").pop())).toEqual(["slug-pt"]);
  });
});

describe("PUNTOTICKET_VENUE_NOTFOUND_RETRY_DAYS", () => {
  it("default 30, entero válido o error de uso", () => {
    expect(resolveNotFoundRetryDays({})).toBe(30);
    expect(resolveNotFoundRetryDays({ PUNTOTICKET_VENUE_NOTFOUND_RETRY_DAYS: "7" })).toBe(7);
    for (const bad of ["-1", "x", "1.5"]) {
      expect(() => resolveNotFoundRetryDays({ PUNTOTICKET_VENUE_NOTFOUND_RETRY_DAYS: bad })).toThrow(CliUsageError);
    }
  });
});
