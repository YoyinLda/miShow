import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { PuntoticketScrapeResult } from "../src/puntoticket/acquisition/orchestrator.js";
import type { NormalizedEvent } from "../src/puntoticket/contracts.js";
import { PersistenceError, type EventPersistence, type FinishRunInput, type ScrapeErrorInput } from "../src/puntoticket/persistence/contracts.js";
import { mapEventForPersistence, sanitizePersistenceMessage } from "../src/puntoticket/persistence/mapping.js";
import { createSupabaseRpcTransport, SupabaseEventPersistence, supabaseServerConfig, type RpcRequest } from "../src/puntoticket/persistence/supabase-data-api.js";
import { executePersistedPuntoTicketScrape, PersistedRunError } from "../src/puntoticket/persistence/workflow.js";

const migration = readFileSync(new URL("../supabase/migrations/20260909151251_puntoticket_persistence.sql", import.meta.url), "utf8");

describe("PuntoTicket persistence migration contract", () => {
  it("declares the approved tables, identities and natural uniqueness", () => {
    for (const table of ["sources", "events", "performances", "event_artists", "event_venues", "scrape_runs", "scrape_errors"]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("id bigint generated always as identity primary key");
    expect(migration).toContain("unique (source_id, source_url)");
    expect(migration).toContain("unique (event_id, starts_at)");
  });

  it("keeps RPCs invoker-safe and private while exposing read-only catalog data", () => {
    expect(migration.match(/security invoker/gu)).toHaveLength(4);
    expect(migration.match(/set search_path = ''/gu)).toHaveLength(4);
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("revoke execute on function public.persist_normalized_event(bigint, jsonb) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.persist_normalized_event(bigint, jsonb) to service_role");
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/iu);
  });

  it("uses conservative temporal merges without deleting absent snapshots", () => {
    expect(migration).toContain("where excluded.source_extracted_at >= current.source_extracted_at");
    expect(migration).toContain("excluded.status = 'unknown' and current.status <> 'unknown'");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).not.toMatch(/delete\s+from\s+public\.(?:event_artists|event_venues|performances)/iu);
  });

  it("documents retention without adding scheduled deletion", () => {
    expect(migration).toContain("succeeded 90 days; partial/failed 180 days; running older than 2 hours");
    expect(migration).not.toMatch(/pg_cron|cron\.schedule|delete\s+from\s+public\.scrape_(?:runs|errors)/iu);
  });
});

describe("PuntoTicket persistence mapping", () => {
  it("maps only normalized data and orders snapshots and performances deterministically", () => {
    const event = normalizedEvent({
      artists: ["Víctor Jara", "Ana Tijoux"],
      venue: { name: " Teatro  Municipal ", city: "Santiago" },
      performances: [
        { starts_at: "2026-12-13T20:00:00-03:00", timezone: "America/Santiago", status: "sold_out" },
        { starts_at: "2026-12-12T20:00:00-03:00", timezone: "America/Santiago", status: "available", performance_code: "A", purchase_url: "https://www.puntoticket.com/queue/enqueue/A" }
      ]
    });

    expect(mapEventForPersistence(event)).toMatchObject({
      source: "puntoticket",
      source_url: event.source_url,
      artists: [
        { name: "Ana Tijoux", normalized_name: "ana tijoux", position: 1 },
        { name: "Víctor Jara", normalized_name: "victor jara", position: 0 }
      ],
      venue: { name: " Teatro  Municipal ", normalized_name: "teatro municipal", city: "Santiago" },
      performances: [
        { starts_at: "2026-12-12T20:00:00-03:00", status: "available" },
        { starts_at: "2026-12-13T20:00:00-03:00", status: "sold_out" }
      ]
    });
  });

  it("rejects invalid normalized contracts before invoking persistence", () => {
    expect(() => mapEventForPersistence(normalizedEvent({ source_url: "https://www.puntoticket.com/evento/x?tracking=1" }))).toThrow("canonica");
    expect(() => mapEventForPersistence(normalizedEvent({ extracted_at: "2026-02-30T12:00:00Z" }))).toThrow("extracted_at");
    expect(() => mapEventForPersistence(normalizedEvent({ price: { min: 20, max: 10, currency: "CLP" } }))).toThrow("price.min");
    expect(() => mapEventForPersistence(normalizedEvent({ status: "invalid" as NormalizedEvent["status"] }))).toThrow("status");
    expect(() => mapEventForPersistence(normalizedEvent({
      performances: [
        { starts_at: "2026-12-12T20:00:00-03:00", timezone: "America/Santiago", status: "available" },
        { starts_at: "2026-12-12T23:00:00Z", timezone: "America/Santiago", status: "sold_out" }
      ]
    }))).toThrow("instantes duplicados");
  });

  it("sanitizes complete credential values while preserving non-sensitive context", () => {
    const secret = "sb_secret_REAL";
    const message = sanitizePersistenceMessage(`request failed
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.REAL
Proxy-Authorization=Basic dXNlcjpwYXNz
Cookie: session=SECRET; refresh=MORE
Set-Cookie: response=PRIVATE; HttpOnly
api-key=API_SECRET access_token=TOKEN_SECRET
https://user:pass@example.test/private
Bearer LOOSE_SECRET
${secret}
status=401`, [secret]);

    expect(message).toBe(
      "request failed Authorization=[REDACTED] Proxy-Authorization=[REDACTED] Cookie=[REDACTED] Set-Cookie=[REDACTED] api-key=[REDACTED] access_token=[REDACTED] https://[REDACTED]@example.test/private Bearer [REDACTED] [REDACTED] status=401"
    );
  });

  it("sanitizes stringified JSON values without breaking its shape and is idempotent", () => {
    const message = '{"Authorization":"Bearer JWT","Proxy-Authorization":"Basic BASIC_JSON","Cookie":"session=COOKIE_JSON; refresh=MORE","api-key":"API_JSON","access_token":"TOKEN_JSON","refresh_token":"REFRESH_JSON","token":"DIRECT_TOKEN_JSON","Set-Cookie":"session=SET_COOKIE_JSON; HttpOnly","status":401}';
    const sanitized = sanitizePersistenceMessage(message);

    expect(sanitized).toBe('{"Authorization":"[REDACTED]","Proxy-Authorization":"[REDACTED]","Cookie":"[REDACTED]","api-key":"[REDACTED]","access_token":"[REDACTED]","refresh_token":"[REDACTED]","token":"[REDACTED]","Set-Cookie":"[REDACTED]","status":401}');
    for (const secret of ["JWT", "BASIC_JSON", "COOKIE_JSON", "MORE", "API_JSON", "TOKEN_JSON", "REFRESH_JSON", "DIRECT_TOKEN_JSON", "SET_COOKIE_JSON"]) {
      expect(sanitized).not.toContain(secret);
    }
    expect(JSON.parse(sanitized)).toMatchObject({ status: 401, Authorization: "[REDACTED]" });
    expect(sanitizePersistenceMessage(sanitized)).toBe(sanitized);
  });

  it("sanitizes multiline inspected objects while retaining non-sensitive fields", () => {
    const sanitized = sanitizePersistenceMessage(`{
  Authorization: 'Bearer JWT',
  Cookie: 'session=COOKIE_JSON; refresh=MORE',
  apikey: 'API_JSON',
  token: 'TOKEN_JSON',
  note: 'safe context'
}`);

    expect(sanitized).toBe("{ Authorization: '[REDACTED]', Cookie: '[REDACTED]', apikey: '[REDACTED]', token: '[REDACTED]', note: 'safe context' }");
    for (const secret of ["JWT", "COOKIE_JSON", "MORE", "API_JSON", "TOKEN_JSON"]) expect(sanitized).not.toContain(secret);
    expect(sanitizePersistenceMessage(sanitized)).toBe(sanitized);
  });

  it("sanitizes spaced JSON without removing harmless fields", () => {
    const sanitized = sanitizePersistenceMessage('{ "Authorization" : "Bearer JWT", "Set-Cookie" : "session=SET_COOKIE_JSON; HttpOnly", "status" : 401 }');
    expect(sanitized).toBe('{ "Authorization" : "[REDACTED]", "Set-Cookie" : "[REDACTED]", "status" : 401 }');
    expect(JSON.parse(sanitized)).toMatchObject({ status: 401 });
    expect(sanitizePersistenceMessage(sanitized)).toBe(sanitized);
  });

  it("bounds sanitized messages", () => {
    expect(sanitizePersistenceMessage("x".repeat(2100))).toHaveLength(2000);
  });
});

describe("Supabase Data API persistence adapter", () => {
  it("uses the four RPC contracts and keeps run ids as strings", async () => {
    const calls: RpcRequest[] = [];
    const rpc = vi.fn(async (request: RpcRequest) => {
      calls.push(request);
      if (request.functionName === "start_scrape_run") return { run_id: "9007199254740993", status: "running" };
      if (request.functionName === "persist_normalized_event") return { event_id: "8", warnings: [] };
      return { ok: true };
    });
    const persistence = new SupabaseEventPersistence(rpc);
    const run = await persistence.startRun(startInput());
    await persistence.persistEvent(run.run_id, normalizedEvent());
    await persistence.recordError(run.run_id, { stage: "parse", severity: "warning", code: "parser_warning", message: "warning", attempts: 1 });
    await persistence.finishRun(run.run_id, finishInput());

    expect(run.run_id).toBe("9007199254740993");
    expect(calls.map((call) => call.functionName)).toEqual([
      "start_scrape_run", "persist_normalized_event", "record_scrape_error", "finish_scrape_run"
    ]);
    expect(calls[1].parameters).toMatchObject({ p_run_id: "9007199254740993" });
  });

  it("retries at most twice and only for serialization/deadlock SQLSTATEs", async () => {
    for (const code of ["40001", "40P01"]) {
      let attempts = 0;
      const persistence = new SupabaseEventPersistence(async () => {
        attempts += 1;
        if (attempts < 3) throw new PersistenceError(code, "transient");
        return { run_id: "1", status: "running" };
      });
      await expect(persistence.startRun(startInput())).resolves.toEqual({ run_id: "1", status: "running" });
      expect(attempts).toBe(3);
    }

    let permanentAttempts = 0;
    const permanent = new SupabaseEventPersistence(async () => {
      permanentAttempts += 1;
      throw new PersistenceError("23505", "unique violation");
    });
    await expect(permanent.startRun(startInput())).rejects.toMatchObject({ code: "23505" });
    expect(permanentAttempts).toBe(1);
  });

  it("sends secret keys only as apikey and redacts Data API errors", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({ apikey: "sb_secret_TEST", "content-type": "application/json" });
      expect(init?.headers).not.toHaveProperty("Authorization");
      return new Response(JSON.stringify({ code: "40001", message: "apikey=sb_secret_TEST serialization" }), {
        status: 409,
        headers: { "content-type": "application/json" }
      });
    });
    const rpc = createSupabaseRpcTransport({ url: "https://project.supabase.co", secretKey: "sb_secret_TEST" }, fetchMock as typeof fetch);
    await expect(rpc({ functionName: "start_scrape_run", parameters: {} })).rejects.toMatchObject({ code: "40001", message: "apikey=[REDACTED] serialization" });
  });

  it("validates server configuration without accepting remote plaintext or userinfo", () => {
    expect(supabaseServerConfig({ SUPABASE_URL: "https://project.supabase.co/", SUPABASE_SECRET_KEY: "sb_secret_TEST" })).toEqual({
      url: "https://project.supabase.co",
      secretKey: "sb_secret_TEST"
    });
    expect(supabaseServerConfig({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "local" }).url).toBe("http://127.0.0.1:54321");
    expect(() => supabaseServerConfig({})).toThrow("SUPABASE_URL y SUPABASE_SECRET_KEY");
    expect(() => supabaseServerConfig({ SUPABASE_URL: "http://project.example", SUPABASE_SECRET_KEY: "secret" })).toThrow("HTTPS");
    expect(() => supabaseServerConfig({ SUPABASE_URL: "https://user:pass@project.supabase.co", SUPABASE_SECRET_KEY: "secret" })).toThrow("sin credenciales");
  });
});

describe("persisted PuntoTicket scrape workflow", () => {
  it("keeps successful events, records individual failures and finishes partial", async () => {
    const recorded: ScrapeErrorInput[] = [];
    let finished: FinishRunInput | undefined;
    const persistence: EventPersistence = {
      startRun: async () => ({ run_id: "42", status: "running" }),
      persistEvent: async (_runId, event) => {
        if (event.source_url.endsWith("/B")) throw new PersistenceError("23514", "constraint failed");
        return {
          event_id: "7",
          warnings: [{ stage: "persist", source_url: event.source_url, severity: "warning", code: "duplicate_source_code", message: "retained", attempts: 1 }]
        };
      },
      recordError: async (_runId, error) => { recorded.push(error); },
      finishRun: async (_runId, result) => { finished = result; }
    };
    const result = await executePersistedPuntoTicketScrape({
      persistence,
      start: startInput(),
      scrape: async () => scrapeResult({
        events: [normalizedEvent({ source_url: "https://www.puntoticket.com/evento/A" }), normalizedEvent({ source_url: "https://www.puntoticket.com/evento/B" })],
        errors: [{ stage: "parse", source_url: "https://www.puntoticket.com/evento/A", code: "parser_warning", message: "warning", attempts: 1 }]
      }),
      now: () => new Date("2026-09-09T12:00:10.000Z")
    });

    expect(result).toMatchObject({ run_id: "42", status: "partial", summary: { discovered: 2, attempted: 2, succeeded: 1, failed: 1 } });
    expect(result.errors.map((error) => error.code)).toEqual(["parser_warning", "duplicate_source_code", "23514"]);
    expect(recorded.map((error) => [error.code, error.severity])).toEqual([["parser_warning", "warning"], ["23514", "error"]]);
    expect(finished).toMatchObject({ status: "partial", succeeded_count: 1, failed_count: 1, warnings_count: 2, snapshot_complete: false });
  });

  it("finishes a started run as failed when acquisition fails globally", async () => {
    let finished: FinishRunInput | undefined;
    const recorded: ScrapeErrorInput[] = [];
    const persistence: EventPersistence = {
      startRun: async () => ({ run_id: "51", status: "running" }),
      persistEvent: async () => ({ event_id: "1", warnings: [] }),
      recordError: async (_runId, error) => { recorded.push(error); },
      finishRun: async (_runId, result) => { finished = result; }
    };
    const promise = executePersistedPuntoTicketScrape({
      persistence,
      start: startInput(),
      scrape: async () => { throw new Error("listing failed"); },
      now: () => new Date("2026-09-09T12:00:10.000Z")
    });
    await expect(promise).rejects.toBeInstanceOf(PersistedRunError);
    await expect(promise).rejects.toMatchObject({ runId: "51" });
    expect(recorded).toMatchObject([{ stage: "listing", severity: "error", code: "global_acquisition_failure" }]);
    expect(finished).toMatchObject({ status: "failed", failed_count: 0, succeeded_count: 0 });
  });

  it("finishes a global failure and preserves its primary error when recording fails", async () => {
    const finishRun = vi.fn(async () => undefined);
    const persistence: EventPersistence = {
      startRun: async () => ({ run_id: "52", status: "running" }),
      persistEvent: async () => ({ event_id: "1", warnings: [] }),
      recordError: async () => { throw new PersistenceError("record_error_failed", "secondary recording failed"); },
      finishRun
    };

    const error = await executePersistedPuntoTicketScrape({
      persistence,
      start: startInput(),
      scrape: async () => { throw new Error("primary listing failure"); },
      now: () => new Date("2026-09-09T12:00:10.000Z")
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ runId: "52", message: "primary listing failure" });
    expect(finishRun).toHaveBeenCalledWith("52", expect.objectContaining({ status: "failed", succeeded_count: 0 }));
  });

  it("finishes an individual persistence failure when its error recording fails", async () => {
    const finishRun = vi.fn(async () => undefined);
    const persistence: EventPersistence = {
      startRun: async () => ({ run_id: "53", status: "running" }),
      persistEvent: async (_runId, event) => {
        if (event.source_url.endsWith("/B")) throw new PersistenceError("23514", "primary constraint failure");
        return { event_id: "1", warnings: [] };
      },
      recordError: async () => { throw new PersistenceError("record_error_failed", "secondary recording failed"); },
      finishRun
    };

    const result = await executePersistedPuntoTicketScrape({
      persistence,
      start: startInput(),
      scrape: async () => scrapeResult({
        events: [
          normalizedEvent({ source_url: "https://www.puntoticket.com/evento/A" }),
          normalizedEvent({ source_url: "https://www.puntoticket.com/evento/B" })
        ]
      }),
      now: () => new Date("2026-09-09T12:00:10.000Z")
    });

    expect(result).toMatchObject({ run_id: "53", status: "partial", summary: { succeeded: 1, failed: 1 } });
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "23514", message: "primary constraint failure" }));
    expect(finishRun).toHaveBeenCalledWith("53", expect.objectContaining({ status: "partial", succeeded_count: 1, failed_count: 1 }));
  });

  it("preserves run identity and a sanitized cause when finalization fails", async () => {
    const persistence: EventPersistence = {
      startRun: async () => ({ run_id: "54", status: "running" }),
      persistEvent: async () => ({ event_id: "1", warnings: [] }),
      recordError: async () => undefined,
      finishRun: async () => {
        throw new PersistenceError(
          "finish_failed token=CODE_SECRET",
          "Authorization: Bearer MESSAGE_SECRET"
        );
      }
    };

    const error = await executePersistedPuntoTicketScrape({
      persistence,
      start: startInput(),
      scrape: async () => scrapeResult({ events: [normalizedEvent()] }),
      now: () => new Date("2026-09-09T12:00:10.000Z")
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PersistedRunError);
    if (!(error instanceof PersistedRunError)) {
      throw new TypeError("Se esperaba PersistedRunError.");
    }
    expect(error).toMatchObject({
      runId: "54",
      message: "finishRun fallo (finish_failed token=[REDACTED]): Authorization=[REDACTED]",
      finalizationError: {
        code: "finish_failed token=[REDACTED]",
        message: "Authorization=[REDACTED]"
      }
    });
    expect(error.cause).toBe(error.finalizationError);
  });
});

describe("PuntoTicket persistence CLI", () => {
  it("keeps the non-persistent path independent from Supabase configuration", () => {
    const result = spawnScrape(["--live", "--max-events", "1", "--delay-ms", "1000"], {
      SUPABASE_URL: "not-a-url",
      SUPABASE_SECRET_KEY: ""
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).not.toHaveProperty("run_id");
  });

  it("validates persistence configuration before any acquisition request", () => {
    const result = spawnScrape(["--live", "--persist"], { SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("SUPABASE_URL y SUPABASE_SECRET_KEY");
  });

  it("returns run_id/status and exit zero for a persisted successful run", () => {
    const result = spawnScrape(["--live", "--persist", "--max-events", "1", "--delay-ms", "1000"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ run_id: "42", status: "succeeded", summary: { succeeded: 1, failed: 0 } });
  });

  it("keeps exit zero for partial runs", () => {
    const result = spawnScrape(["--live", "--persist", "--max-events", "1", "--delay-ms", "1000"], { MISHOW_TEST_PERSIST_WARNING: "1" });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ run_id: "42", status: "partial" });
  });

  it("returns run identity as JSON and exit one for global acquisition failures", () => {
    const result = spawnScrape(["--live", "--persist", "--max-events", "1", "--delay-ms", "1000"], { MISHOW_TEST_LISTING_FAILURE: "1" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ run_id: "42", status: "failed" });
    expect(result.stderr).toContain("listing test failure");
  }, 10_000);

  it("returns the failed persisted result and exit one when no event can be stored", () => {
    const result = spawnScrape(["--live", "--persist", "--max-events", "1", "--delay-ms", "1000"], { MISHOW_TEST_PERSIST_FAILURE: "1" });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ run_id: "42", status: "failed", summary: { succeeded: 0, failed: 1 } });
  });

  it("returns run identity and a sanitized error when finalization fails", () => {
    const result = spawnScrape(
      ["--live", "--persist", "--max-events", "1", "--delay-ms", "1000"],
      { MISHOW_TEST_FINISH_FAILURE: "1" }
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ run_id: "42", status: "failed" });
    expect(result.stderr).toContain("finishRun fallo (finish_failed): Authorization=[REDACTED]");
    expect(result.stderr).not.toContain("FINISH_SECRET");
  });
});

function spawnScrape(arguments_: string[], environment: Record<string, string> = {}) {
  return spawnSync("node", ["--import", "tsx/esm", "--import", "./tests/helpers/puntoticket-mock-fetch.ts", "src/cli/puntoticket-scrape.ts", ...arguments_], {
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: "sb_secret_TEST",
      ...environment
    }
  });
}

function normalizedEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    source: "puntoticket",
    source_url: "https://www.puntoticket.com/evento/A",
    extracted_at: "2026-09-09T12:00:00.000Z",
    name: "Evento A",
    artists: [],
    performances: [{ starts_at: "2026-12-12T20:00:00-03:00", timezone: "America/Santiago", status: "available" }],
    status: "available",
    ...overrides
  };
}

function startInput() {
  return {
    source: "puntoticket" as const,
    listing_url: "https://www.puntoticket.com/musica",
    started_at: "2026-09-09T12:00:00.000Z",
    parameters: { max_events: 2 }
  };
}

function finishInput(): FinishRunInput {
  return {
    finished_at: "2026-09-09T12:00:10.000Z",
    status: "succeeded",
    discovered_count: 1,
    attempted_count: 1,
    succeeded_count: 1,
    failed_count: 0,
    warnings_count: 0,
    snapshot_complete: false
  };
}

function scrapeResult(overrides: Partial<PuntoticketScrapeResult> = {}): PuntoticketScrapeResult {
  return {
    source: "puntoticket",
    started_at: "2026-09-09T12:00:00.000Z",
    finished_at: "2026-09-09T12:00:05.000Z",
    listing_url: "https://www.puntoticket.com/musica",
    summary: { discovered: 2, attempted: 2, succeeded: 2, failed: 0 },
    events: [normalizedEvent()],
    errors: [],
    ...overrides
  };
}
