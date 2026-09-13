import { hasExternalWhitespace, hasUserinfo } from "@mishow/domain";
import type { AcquisitionStage, AcquisitionUrlContext, SourceAdapter } from "../adapter.js";

export type { AcquisitionStage, AcquisitionUrlContext } from "../adapter.js";

// Los límites de cobertura son configurables por entorno para poder subirlos o
// bajarlos sin recompilar: MAX_EVENTS (cuántos eventos procesar por corrida) y
// MAX_EVENTS_LIMIT (tope duro de seguridad). El listado de /musica entrega hoy
// ~48-66 eventos en un solo HTML, por eso el default cubre el catálogo con margen.
const DEFAULT_MAX_EVENTS = 60;
const DEFAULT_MAX_EVENTS_LIMIT = 200;

function envInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : fallback;
}

export interface AcquisitionDefaults {
  listingUrl: string;
  userAgent: string;
  concurrency: number;
  maxConcurrency: number;
  delayMs: number;
  minDelayMs: number;
  timeoutMs: number;
  maxTimeoutMs: number;
  retries: number;
  maxRetries: number;
  redirects: number;
  maxRedirects: number;
  maxHtmlBytes: number;
  maxEvents: number;
  maxEventsLimit: number;
  maxRetryAfterMs: number;
}

/**
 * Construye los defaults de adquisición para un adapter. `listingUrl` y
 * `userAgent` provienen de la fuente; el resto son los límites operativos
 * comunes (heredados de PuntoTicket) que aplican por igual a todas las fuentes.
 */
export function acquisitionDefaults(adapter: SourceAdapter): AcquisitionDefaults {
  return {
    listingUrl: adapter.listingUrl,
    userAgent: `miShow-${adapter.source}-acquisition/0.1`,
    concurrency: 2,
    maxConcurrency: 2,
    delayMs: 1500,
    minDelayMs: 1000,
    timeoutMs: 15000,
    maxTimeoutMs: 30000,
    retries: 2,
    maxRetries: 2,
    redirects: 3,
    maxRedirects: 3,
    maxHtmlBytes: 2 * 1024 * 1024,
    maxEvents: envInteger("MAX_EVENTS", DEFAULT_MAX_EVENTS),
    maxEventsLimit: envInteger("MAX_EVENTS_LIMIT", DEFAULT_MAX_EVENTS_LIMIT),
    maxRetryAfterMs: 30000
  };
}

export interface AcquisitionConfig {
  listingUrl: string;
  userAgent: string;
  concurrency: number;
  delayMs: number;
  timeoutMs: number;
  retries: number;
  redirects: number;
  maxHtmlBytes: number;
  maxEvents: number;
  maxRetryAfterMs: number;
}

export class AcquisitionPolicyError extends Error {
  readonly code = "url_rejected";

  constructor(message: string) {
    super(message);
    this.name = "AcquisitionPolicyError";
  }
}

export function acquisitionConfig(adapter: SourceAdapter, input: Partial<AcquisitionConfig> = {}): AcquisitionConfig {
  const defaults = acquisitionDefaults(adapter);
  const config = {
    listingUrl: input.listingUrl ?? defaults.listingUrl,
    userAgent: input.userAgent ?? defaults.userAgent,
    concurrency: input.concurrency ?? defaults.concurrency,
    delayMs: input.delayMs ?? defaults.delayMs,
    timeoutMs: input.timeoutMs ?? defaults.timeoutMs,
    retries: input.retries ?? defaults.retries,
    redirects: input.redirects ?? defaults.redirects,
    maxHtmlBytes: input.maxHtmlBytes ?? defaults.maxHtmlBytes,
    maxEvents: input.maxEvents ?? defaults.maxEvents,
    maxRetryAfterMs: input.maxRetryAfterMs ?? defaults.maxRetryAfterMs
  };

  validateInteger(config.concurrency, "concurrency", 1, defaults.maxConcurrency);
  validateInteger(config.delayMs, "delay-ms", defaults.minDelayMs, Number.MAX_SAFE_INTEGER);
  validateInteger(config.timeoutMs, "timeout-ms", 1, defaults.maxTimeoutMs);
  validateInteger(config.retries, "retries", 0, defaults.maxRetries);
  validateInteger(config.redirects, "redirects", 0, defaults.maxRedirects);
  validateInteger(config.maxHtmlBytes, "max-html-bytes", 1, defaults.maxHtmlBytes);
  validateInteger(config.maxEvents, "max-events", 0, defaults.maxEventsLimit);
  validateInteger(config.maxRetryAfterMs, "max-retry-after-ms", 0, defaults.maxTimeoutMs);
  if (!config.userAgent.trim()) throw new AcquisitionPolicyError("user-agent es obligatorio.");
  validateAcquisitionUrl(adapter, config.listingUrl, "listing");
  return config;
}

export function validateAcquisitionUrl(
  adapter: SourceAdapter,
  value: string,
  stage: AcquisitionStage,
  baseUrl?: string,
  context: AcquisitionUrlContext = {}
): string {
  if (hasExternalWhitespace(value) || (baseUrl !== undefined && hasExternalWhitespace(baseUrl)) || (stage === "detail" && context.discoveredDetailUrl !== undefined && hasExternalWhitespace(context.discoveredDetailUrl))) {
    throw new AcquisitionPolicyError("URL invalida.");
  }
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new AcquisitionPolicyError("URL invalida.");
  }

  if (url.protocol !== "https:") throw new AcquisitionPolicyError("Solo se permite HTTPS.");
  if (url.hostname !== adapter.host) throw new AcquisitionPolicyError("Host no permitido.");
  if (url.username || url.password || hasUserinfo(value, baseUrl)) throw new AcquisitionPolicyError("La URL no debe incluir credenciales.");
  if (url.port && url.port !== "443") throw new AcquisitionPolicyError("Puerto no permitido.");
  if (adapter.isBlockedPath(url.pathname, stage)) throw new AcquisitionPolicyError("Ruta bloqueada para adquisicion.");
  if (stage === "listing" && !adapter.isListingPath(url.pathname)) throw new AcquisitionPolicyError("Listing no permitido.");
  url.search = "";
  url.hash = "";
  if (stage === "detail" && !adapter.isDetailPath(url.pathname, context)) throw new AcquisitionPolicyError("Detalle no permitido.");
  return url.href;
}

export function safeUrlForError(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.href;
  } catch {
    return "[url-invalida]";
  }
}

function validateInteger(value: number, name: string, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AcquisitionPolicyError(`${name} debe estar entre ${min} y ${max}.`);
  }
}
