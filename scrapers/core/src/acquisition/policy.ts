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

/**
 * Opciones opt-in de resiliencia. `undefined` (default) = comportamiento
 * actual; cada campo omitido también conserva el comportamiento actual.
 */
export interface ResilienceConfig {
  /** Clasifica 401/403, desafíos y redirecciones bloqueadas con códigos específicos. */
  classifyBlocking?: boolean;
  /** Proporción 0–1 de jitter sobre el backoff lineal. */
  jitterRatio?: number;
  /** Mínimo de referencias del listado (entero ≥ 0). */
  minListingRefs?: number;
  /** Ratio 0–1 de fallas de detalle desde el cual la corrida es degradada. */
  degradedRatio?: number;
  /** Ratio 0–1 de fallas de detalle desde el cual la corrida es fallida. */
  failedRatio?: number;
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
  resilience?: ResilienceConfig;
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
  if (input.resilience === undefined) return config;
  return { ...config, resilience: validateResilience(input.resilience) };
}

function validateResilience(input: ResilienceConfig): ResilienceConfig {
  const resilience: ResilienceConfig = { ...input };
  if (input.classifyBlocking !== undefined && typeof input.classifyBlocking !== "boolean") {
    throw new AcquisitionPolicyError("classifyBlocking debe ser booleano.");
  }
  if (input.jitterRatio !== undefined) validateRatio(input.jitterRatio, "jitterRatio");
  if (input.degradedRatio !== undefined) validateRatio(input.degradedRatio, "degradedRatio");
  if (input.failedRatio !== undefined) validateRatio(input.failedRatio, "failedRatio");
  if (input.minListingRefs !== undefined) validateInteger(input.minListingRefs, "minListingRefs", 0, Number.MAX_SAFE_INTEGER);
  if (input.degradedRatio !== undefined && input.failedRatio !== undefined && input.degradedRatio > input.failedRatio) {
    throw new AcquisitionPolicyError("degradedRatio no puede superar failedRatio.");
  }
  return resilience;
}

function validateRatio(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new AcquisitionPolicyError(`${name} debe estar entre 0 y 1.`);
  }
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
