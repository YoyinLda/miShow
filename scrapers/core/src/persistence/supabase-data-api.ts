import type { NormalizedEvent } from "@mishow/domain";
import type { SourceAdapter } from "../adapter.js";
import {
  PersistenceError,
  type EventPersistence,
  type FinishRunInput,
  type PersistEventResult,
  type ScrapeErrorInput,
  type ScrapeRun,
  type StartRunInput
} from "./contracts.js";
import { mapEventForPersistence, mapFinishRun, mapScrapeError, mapStartRun, sanitizePersistenceMessage } from "./mapping.js";

const RETRYABLE_SQLSTATES = new Set(["40001", "40P01"]);

export interface SupabaseServerConfig {
  url: string;
  secretKey: string;
}

export interface RpcRequest {
  functionName: "start_scrape_run" | "persist_normalized_event" | "record_scrape_error" | "finish_scrape_run" | "record_venue_source_checks";
  parameters: Record<string, unknown>;
}

export type RpcTransport = (request: RpcRequest) => Promise<unknown>;

export class SupabaseEventPersistence implements EventPersistence {
  constructor(private readonly adapter: SourceAdapter, private readonly rpc: RpcTransport, private readonly maxRetries = 2) {
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) {
      throw new PersistenceError("validation_error", "maxRetries debe estar entre 0 y 2.");
    }
  }

  async startRun(input: StartRunInput): Promise<ScrapeRun> {
    const mapped = mapStartRun(this.adapter, input);
    const value = await this.invoke("start_scrape_run", {
      p_input: { ...mapped, source_name: this.adapter.name, source_base_url: this.adapter.baseUrl }
    });
    const result = objectResult(value);
    if (typeof result.run_id !== "string" || result.status !== "running") throw invalidResponse();
    return { run_id: result.run_id, status: "running" };
  }

  async persistEvent(runId: string, event: NormalizedEvent): Promise<PersistEventResult> {
    const value = await this.invoke("persist_normalized_event", { p_run_id: runId, p_event: mapEventForPersistence(this.adapter, event) });
    const result = objectResult(value);
    if (typeof result.event_id !== "string" || !Array.isArray(result.warnings)) throw invalidResponse();
    return { event_id: result.event_id, warnings: result.warnings as PersistEventResult["warnings"] };
  }

  async recordError(runId: string, error: ScrapeErrorInput): Promise<void> {
    await this.invoke("record_scrape_error", { p_run_id: runId, p_error: mapScrapeError(error) });
  }

  async finishRun(runId: string, result: FinishRunInput): Promise<void> {
    await this.invoke("finish_scrape_run", { p_run_id: runId, p_result: mapFinishRun(this.adapter, result) });
  }

  private async invoke(functionName: RpcRequest["functionName"], parameters: Record<string, unknown>): Promise<unknown> {
    let retries = 0;
    while (true) {
      try {
        return await this.rpc({ functionName, parameters });
      } catch (error) {
        if (!(error instanceof PersistenceError) || !RETRYABLE_SQLSTATES.has(error.code) || retries >= this.maxRetries) throw error;
        retries += 1;
      }
    }
  }
}

export function supabaseServerConfig(environment: NodeJS.ProcessEnv): SupabaseServerConfig {
  const rawUrl = environment.SUPABASE_URL;
  const secretKey = environment.SUPABASE_SECRET_KEY;
  if (!rawUrl?.trim() || !secretKey?.trim()) {
    throw new PersistenceError("invalid_configuration", "SUPABASE_URL y SUPABASE_SECRET_KEY son obligatorias con --persist.");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PersistenceError("invalid_configuration", "SUPABASE_URL no es valida.");
  }
  const localHttp = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash) {
    throw new PersistenceError("invalid_configuration", "SUPABASE_URL debe ser HTTPS o una URL HTTP local sin credenciales.");
  }
  return { url: url.href.replace(/\/$/u, ""), secretKey };
}

export function createSupabaseRpcTransport(config: SupabaseServerConfig, fetchImplementation: typeof fetch = fetch): RpcTransport {
  return async ({ functionName, parameters }) => {
    let response: Response;
    try {
      response = await fetchImplementation(`${config.url}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: {
          apikey: config.secretKey,
          "content-type": "application/json"
        },
        body: JSON.stringify(parameters)
      });
    } catch (error) {
      throw new PersistenceError("transport_error", sanitizePersistenceMessage(error instanceof Error ? error.message : error, [config.secretKey]));
    }

    const text = await response.text();
    const payload = parseJson(text);
    if (!response.ok) {
      const body = objectResult(payload, false);
      const code = typeof body?.code === "string" ? body.code : `http_${response.status}`;
      const message = typeof body?.message === "string" ? body.message : "Data API rechazo la operacion.";
      throw new PersistenceError(code, sanitizePersistenceMessage(message, [config.secretKey]), response.status);
    }
    return payload;
  };
}

export interface TableSelectRequest {
  table: "venue_sources";
  columns: readonly string[];
  /** Filtros de igualdad (`columna = valor`). */
  eq: Readonly<Record<string, string>>;
}

export type TableSelectTransport = (request: TableSelectRequest) => Promise<unknown>;

/** Transporte de lectura (PostgREST GET) con las mismas credenciales y errores que el transporte RPC. */
export function createSupabaseTableSelectTransport(
  config: SupabaseServerConfig,
  fetchImplementation: typeof fetch = fetch
): TableSelectTransport {
  return async ({ table, columns, eq }) => {
    const query = new URLSearchParams({ select: columns.join(",") });
    for (const [column, value] of Object.entries(eq)) query.set(column, `eq.${value}`);
    let response: Response;
    try {
      response = await fetchImplementation(`${config.url}/rest/v1/${table}?${query.toString()}`, {
        method: "GET",
        headers: { apikey: config.secretKey, accept: "application/json" }
      });
    } catch (error) {
      throw new PersistenceError("transport_error", sanitizePersistenceMessage(error instanceof Error ? error.message : error, [config.secretKey]));
    }

    const payload = parseJson(await response.text());
    if (!response.ok) {
      const body = objectResult(payload, false);
      const code = typeof body?.code === "string" ? body.code : `http_${response.status}`;
      const message = typeof body?.message === "string" ? body.message : "Data API rechazo la operacion.";
      throw new PersistenceError(code, sanitizePersistenceMessage(message, [config.secretKey]), response.status);
    }
    return payload;
  };
}

export type VenueSourceStatus = "candidate" | "active" | "not_found";

export interface VenueSourceRow {
  source_slug: string;
  source_url: string;
  /** Ausente => "candidate". */
  status?: VenueSourceStatus;
  last_checked_at?: string | null;
}

export interface VenueSourceCheck {
  source_slug: string;
  status: "active" | "not_found";
}

/** Lee `source_slug, source_url` de `venue_sources` para `source`; valida la forma de cada fila. */
export async function listVenueSources(source: string, select: TableSelectTransport): Promise<VenueSourceRow[]> {
  if (typeof source !== "string" || !source.trim()) {
    throw new PersistenceError("validation_error", "source es obligatorio.");
  }
  const payload = await select({ table: "venue_sources", columns: ["source_slug", "source_url", "status", "last_checked_at"], eq: { source } });
  if (!Array.isArray(payload)) throw invalidResponse();
  return payload.map((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      typeof (row as Record<string, unknown>).source_slug !== "string" ||
      typeof (row as Record<string, unknown>).source_url !== "string"
    ) {
      throw invalidResponse();
    }
    const { source_slug, source_url, status, last_checked_at } = row as Record<string, unknown> & VenueSourceRow;
    if (status !== undefined && status !== null && status !== "candidate" && status !== "active" && status !== "not_found") throw invalidResponse();
    if (last_checked_at !== undefined && last_checked_at !== null && (typeof last_checked_at !== "string" || Number.isNaN(Date.parse(last_checked_at)))) {
      throw invalidResponse();
    }
    return { source_slug, source_url, status: status ?? "candidate", last_checked_at: last_checked_at ?? null };
  });
}

/** Registra el resultado de verificar páginas de venue (best-effort para el llamador). No hace nada sin checks. */
export async function recordVenueSourceChecks(source: string, checks: readonly VenueSourceCheck[], rpc: RpcTransport): Promise<void> {
  if (typeof source !== "string" || !source.trim()) throw new PersistenceError("validation_error", "source es obligatorio.");
  for (const check of checks) {
    if (typeof check.source_slug !== "string" || !check.source_slug || (check.status !== "active" && check.status !== "not_found")) {
      throw new PersistenceError("validation_error", "check de venue_sources invalido.");
    }
  }
  if (checks.length === 0) return;
  await rpc({ functionName: "record_venue_source_checks", parameters: { p_source: source, p_checks: checks.map(({ source_slug, status }) => ({ source_slug, status })) } });
}

/** Loader compatible con `VenueSourcesLoader` de `scrapers/puntoticket`. */
export function createVenueSourcesLoader(select: TableSelectTransport): (source: string) => Promise<VenueSourceRow[]> {
  return (source) => listVenueSources(source, select);
}

function parseJson(value: string): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new PersistenceError("invalid_response", "Data API devolvio una respuesta no valida.");
  }
}

function objectResult(value: unknown, required = true): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (!required) return {};
  throw invalidResponse();
}

function invalidResponse(): PersistenceError {
  return new PersistenceError("invalid_response", "Data API devolvio un contrato inesperado.");
}
