import { acquisitionConfig, type AcquisitionConfig, type AcquisitionStage, validateAcquisitionUrl } from "./policy.js";

export type HttpErrorCode = "http_error" | "invalid_content_type" | "response_too_large" | "redirect_rejected" | "too_many_redirects" | "timeout" | "network_error";

export class HttpAcquisitionError extends Error {
  constructor(readonly code: HttpErrorCode, message: string, readonly attempts: number) {
    super(message);
    this.name = "HttpAcquisitionError";
  }
}

export interface HttpTransportRequest {
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}

export interface HttpTransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
}

export type HttpTransport = (request: HttpTransportRequest) => Promise<HttpTransportResponse>;
export type Sleep = (ms: number) => Promise<void>;

export interface HttpClientOptions {
  config?: Partial<AcquisitionConfig>;
  transport: HttpTransport;
  sleep?: Sleep;
  nowMs?: () => number;
}

export class PuntoTicketHttpClient {
  private readonly config: AcquisitionConfig;
  private readonly limiter: RequestLimiter;

  constructor(options: HttpClientOptions) {
    this.config = acquisitionConfig(options.config);
    this.limiter = new RequestLimiter(this.config.delayMs, options.sleep ?? realSleep);
    this.transport = options.transport;
    this.nowMs = options.nowMs ?? Date.now;
  }

  private readonly transport: HttpTransport;
  private readonly nowMs: () => number;

  async getHtml(url: string, stage: AcquisitionStage): Promise<string> {
    let currentUrl = validateAcquisitionUrl(url, stage);
    let redirects = 0;
    let attempts = 0;
    let retryDelayMs = 0;

    while (true) {
      if (retryDelayMs > 0) await this.limiter.wait(retryDelayMs);
      await this.limiter.wait();
      attempts += 1;

      let response: HttpTransportResponse;
      try {
        response = await this.transport({
          url: currentUrl,
          timeoutMs: this.config.timeoutMs,
          maxBytes: this.config.maxHtmlBytes,
          headers: {
            Accept: "text/html, application/xhtml+xml",
            "User-Agent": this.config.userAgent
          }
        });
      } catch (error) {
        if (error instanceof HttpAcquisitionError && error.code !== "timeout") {
          throw new HttpAcquisitionError(error.code, error.message, attempts);
        }
        const code = transportErrorCode(error);
        if (code && attempts <= this.config.retries) {
          retryDelayMs = backoffMs(attempts);
          continue;
        }
        throw new HttpAcquisitionError(code ?? "network_error", safeMessage(error, "Error de red durante adquisicion."), attempts);
      }

      if (isRedirect(response.status)) {
        if (redirects >= this.config.redirects) {
          throw new HttpAcquisitionError("too_many_redirects", "Se excedio el maximo de redirecciones.", attempts);
        }
        const location = header(response.headers, "location");
        if (!location) throw new HttpAcquisitionError("redirect_rejected", "Redireccion sin Location.", attempts);
        try {
          currentUrl = validateAcquisitionUrl(location, stage, currentUrl);
        } catch (error) {
          throw new HttpAcquisitionError("redirect_rejected", safeMessage(error, "Redireccion rechazada."), attempts);
        }
        redirects += 1;
        continue;
      }

      if (isRetryableStatus(response.status) && attempts <= this.config.retries) {
        retryDelayMs = retryAfterMs(header(response.headers, "retry-after"), this.config.maxRetryAfterMs, this.nowMs()) ?? backoffMs(attempts);
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new HttpAcquisitionError("http_error", `HTTP ${response.status}.`, attempts);
      }
      if (!isAllowedHtml(header(response.headers, "content-type"))) {
        throw new HttpAcquisitionError("invalid_content_type", "Content-Type no permitido.", attempts);
      }
      if (byteLength(response.body) > this.config.maxHtmlBytes) {
        throw new HttpAcquisitionError("response_too_large", "Respuesta HTML demasiado grande.", attempts);
      }
      return response.body;
    }
  }
}

export function createFetchTransport(fetchImplementation: typeof fetch = fetch): HttpTransport {
  return async ({ url, headers, timeoutMs, maxBytes }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImplementation(url, { method: "GET", redirect: "manual", headers, signal: controller.signal });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await readLimitedBody(response, maxBytes)
      };
    } catch (error) {
      if (isAbortError(error)) throw new HttpAcquisitionError("timeout", "Timeout de solicitud.", 1);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

class RequestLimiter {
  private chain = Promise.resolve();

  constructor(private readonly delayMs: number, private readonly sleep: Sleep) {}

  wait(delayMs = this.delayMs): Promise<void> {
    const next = this.chain.then(() => this.sleep(delayMs));
    this.chain = next.catch(() => undefined);
    return next;
  }
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function isRetryableStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

function isAllowedHtml(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function retryAfterMs(value: string | undefined, maxMs: number, nowMs: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxMs);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.min(Math.max(0, date - nowMs), maxMs);
  return undefined;
}

function backoffMs(attempt: number): number {
  return attempt * 1000;
}

function transportErrorCode(error: unknown): "timeout" | "network_error" | undefined {
  if (error instanceof HttpAcquisitionError) return error.code === "timeout" ? "timeout" : "network_error";
  if (isAbortError(error)) return "timeout";
  return error instanceof Error ? "network_error" : undefined;
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message.split("\n")[0] : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const body = await response.text();
    if (byteLength(body) > maxBytes) throw new HttpAcquisitionError("response_too_large", "Respuesta HTML demasiado grande.", 1);
    return body;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new HttpAcquisitionError("response_too_large", "Respuesta HTML demasiado grande.", 1);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(join(chunks, received));
}

function join(chunks: Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
