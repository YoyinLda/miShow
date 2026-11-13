import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@mishow/domain";
import type { SourceAdapter } from "../src/adapter.js";
import type { DiscoveryReport } from "../src/acquisition/discovery.js";
import type { ScrapeResult } from "../src/acquisition/orchestrator.js";
import type { EventPersistence, FinishRunInput } from "../src/persistence/contracts.js";
import { mapFinishRun } from "../src/persistence/mapping.js";
import { SupabaseEventPersistence, type RpcRequest } from "../src/persistence/supabase-data-api.js";
import { executePersistedScrape } from "../src/persistence/workflow.js";

const HOST = "www.puntoticket.com";
const adapter = {
  source: "puntoticket",
  name: "PuntoTicket",
  baseUrl: `https://${HOST}`,
  host: HOST,
  listingUrl: `https://${HOST}/musica`,
  purchasePathPatterns: [/^\/comprar(\/|$)/i]
} as unknown as SourceAdapter;

const report: DiscoveryReport = {
  musica_unique: 2,
  venue_unique: 3,
  both: 1,
  missing_count: 2,
  total_unique: 4,
  missing: [`https://${HOST}/evento/a`, `https://${HOST}/evento/b`],
  venue_pages: { requested: 2, succeeded: 1, failed: 1 }
};

const base: FinishRunInput = {
  finished_at: "2026-10-07T12:00:00.000Z",
  status: "succeeded",
  discovered_count: 0,
  attempted_count: 0,
  succeeded_count: 0,
  failed_count: 0,
  warnings_count: 0,
  snapshot_complete: false
};

describe("mapFinishRun discovery_report", () => {
  it("defaults to null when absent or null", () => {
    expect(mapFinishRun(adapter, base).discovery_report).toBeNull();
    expect(mapFinishRun(adapter, { ...base, discovery_report: null }).discovery_report).toBeNull();
  });

  it("accepts a valid report and is idempotent", () => {
    const once = mapFinishRun(adapter, { ...base, discovery_report: report });
    expect(once.discovery_report).toEqual(report);
    expect(mapFinishRun(adapter, once)).toEqual(once);
  });

  it.each([
    ["negative count", { ...report, both: -1 }],
    ["fractional count", { ...report, musica_unique: 1.5 }],
    ["bad venue_pages", { ...report, venue_pages: { requested: 1, succeeded: "1", failed: 0 } }],
    ["fragment in missing", { ...report, missing: [`https://${HOST}/evento/a#x`] }],
    ["credentials in missing", { ...report, missing: [`https://user:pw@${HOST}/evento/a`] }],
    ["non canonical missing", { ...report, missing: [`https://${HOST}/evento/a/`] }],
    ["foreign host in missing", { ...report, missing: ["https://evil.example/evento/a"] }]
  ])("rejects %s", (_name, bad) => {
    expect(() => mapFinishRun(adapter, { ...base, discovery_report: bad as DiscoveryReport })).toThrow(/discovery_report/);
  });
});

describe("finish_scrape_run payload", () => {
  it("sends discovery_report in p_result", async () => {
    const calls: RpcRequest[] = [];
    const persistence = new SupabaseEventPersistence(adapter, async (request) => { calls.push(request); return {}; });
    await persistence.finishRun("1", { ...base, discovery_report: report });
    await persistence.finishRun("1", base);
    expect((calls[0].parameters.p_result as FinishRunInput).discovery_report).toEqual(report);
    expect((calls[1].parameters.p_result as FinishRunInput).discovery_report).toBeNull();
  });
});

describe("executePersistedScrape discovery_report", () => {
  function run(discovery?: DiscoveryReport) {
    const finished: FinishRunInput[] = [];
    const persistence: EventPersistence = {
      startRun: async () => ({ run_id: "1", status: "running" }),
      persistEvent: async () => ({ event_id: "e", warnings: [] }),
      recordError: async () => undefined,
      finishRun: async (_id, result) => { finished.push(result); }
    };
    const scraped = {
      source: "puntoticket",
      summary: { discovered: 0, attempted: 0, succeeded: 0, failed: 0 },
      events: [] as NormalizedEvent[],
      errors: [],
      ...(discovery ? { discovery } : {})
    } as unknown as ScrapeResult;
    return executePersistedScrape({
      persistence,
      start: { source: "puntoticket", listing_url: `https://${HOST}/musica`, started_at: "2026-10-07T12:00:00.000Z", parameters: {} },
      scrape: async () => scraped,
      now: () => new Date("2026-10-07T12:00:01.000Z")
    }).then(() => finished[0]);
  }

  it("forwards the report when discovery ran", async () => {
    expect((await run(report)).discovery_report).toEqual(report);
  });

  it("sends null when there was no discovery", async () => {
    expect((await run()).discovery_report).toBeNull();
  });
});
