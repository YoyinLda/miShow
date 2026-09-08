export const PUNTOTICKET_ACQUISITION_DEFAULTS = {
  listingUrl: "https://www.puntoticket.com/musica",
  userAgent: "miShow-puntoticket-acquisition/0.1",
  concurrency: 1,
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
  maxEvents: 10,
  maxEventsLimit: 50,
  maxRetryAfterMs: 30000
} as const;

export type AcquisitionStage = "listing" | "detail";

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

export function acquisitionConfig(input: Partial<AcquisitionConfig> = {}): AcquisitionConfig {
  const config = {
    listingUrl: input.listingUrl ?? PUNTOTICKET_ACQUISITION_DEFAULTS.listingUrl,
    userAgent: input.userAgent ?? PUNTOTICKET_ACQUISITION_DEFAULTS.userAgent,
    concurrency: input.concurrency ?? PUNTOTICKET_ACQUISITION_DEFAULTS.concurrency,
    delayMs: input.delayMs ?? PUNTOTICKET_ACQUISITION_DEFAULTS.delayMs,
    timeoutMs: input.timeoutMs ?? PUNTOTICKET_ACQUISITION_DEFAULTS.timeoutMs,
    retries: input.retries ?? PUNTOTICKET_ACQUISITION_DEFAULTS.retries,
    redirects: input.redirects ?? PUNTOTICKET_ACQUISITION_DEFAULTS.redirects,
    maxHtmlBytes: input.maxHtmlBytes ?? PUNTOTICKET_ACQUISITION_DEFAULTS.maxHtmlBytes,
    maxEvents: input.maxEvents ?? PUNTOTICKET_ACQUISITION_DEFAULTS.maxEvents,
    maxRetryAfterMs: input.maxRetryAfterMs ?? PUNTOTICKET_ACQUISITION_DEFAULTS.maxRetryAfterMs
  };

  validateInteger(config.concurrency, "concurrency", 1, PUNTOTICKET_ACQUISITION_DEFAULTS.maxConcurrency);
  validateInteger(config.delayMs, "delay-ms", PUNTOTICKET_ACQUISITION_DEFAULTS.minDelayMs, Number.MAX_SAFE_INTEGER);
  validateInteger(config.timeoutMs, "timeout-ms", 1, PUNTOTICKET_ACQUISITION_DEFAULTS.maxTimeoutMs);
  validateInteger(config.retries, "retries", 0, PUNTOTICKET_ACQUISITION_DEFAULTS.maxRetries);
  validateInteger(config.redirects, "redirects", 0, PUNTOTICKET_ACQUISITION_DEFAULTS.maxRedirects);
  validateInteger(config.maxHtmlBytes, "max-html-bytes", 1, PUNTOTICKET_ACQUISITION_DEFAULTS.maxHtmlBytes);
  validateInteger(config.maxEvents, "max-events", 0, PUNTOTICKET_ACQUISITION_DEFAULTS.maxEventsLimit);
  validateInteger(config.maxRetryAfterMs, "max-retry-after-ms", 0, PUNTOTICKET_ACQUISITION_DEFAULTS.maxTimeoutMs);
  if (!config.userAgent.trim()) throw new AcquisitionPolicyError("user-agent es obligatorio.");
  validateAcquisitionUrl(config.listingUrl, "listing");
  return config;
}

export function validateAcquisitionUrl(value: string, stage: AcquisitionStage, baseUrl?: string): string {
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new AcquisitionPolicyError("URL invalida.");
  }

  if (url.protocol !== "https:") throw new AcquisitionPolicyError("Solo se permite HTTPS.");
  if (url.hostname !== "www.puntoticket.com") throw new AcquisitionPolicyError("Host no permitido.");
  if (url.username || url.password) throw new AcquisitionPolicyError("La URL no debe incluir credenciales.");
  if (url.port && url.port !== "443") throw new AcquisitionPolicyError("Puerto no permitido.");
  if (isBlockedPath(url.pathname)) throw new AcquisitionPolicyError("Ruta bloqueada para adquisicion.");
  if (stage === "listing" && !isListingPath(url.pathname)) throw new AcquisitionPolicyError("Listing no permitido.");
  if (stage === "detail" && !isDetailPath(url.pathname)) throw new AcquisitionPolicyError("Detalle no permitido.");
  url.search = "";
  url.hash = "";
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

function isListingPath(pathname: string): boolean {
  return pathname === "/musica" || pathname === "/musica/";
}

function isDetailPath(pathname: string): boolean {
  return /^\/evento\/[A-Za-z0-9-]+\/?$/i.test(pathname);
}

function isBlockedPath(pathname: string): boolean {
  return /^\/(?:queue|login|registro|carrito|checkout|purchase|payment|pago|confirmacion|cuenta|account|seleccion|tickets)(?:\/|$)/i.test(pathname);
}
