const PUNTOTICKET_HOST = "www.puntoticket.com";
const PUNTOTICKET_QUEUE_PATH = /^\/queue\/enqueue\/[^/?#]+$/i;
const PUNTOTICKET_BUY_PATH = /^\/comprar\/evento\/[^/?#]+\/cal\/[^/?#]+$/i;
const ENCODED_PATH_SEPARATOR = /%2f|%5c/i;

/**
 * Opciones para parametrizar la validación de URL por fuente.
 *
 * `host` es el host exacto permitido (p. ej. `www.puntoticket.com` o
 * `www.ticketmaster.cl`). `purchasePathPatterns` son las rutas de compra
 * aceptadas para esa fuente. Los defaults preservan el comportamiento histórico
 * de PuntoTicket para no romper a los llamadores existentes.
 */
export interface SourceUrlOptions {
  host?: string;
  purchasePathPatterns?: RegExp[];
}

const DEFAULT_HOST = PUNTOTICKET_HOST;
const DEFAULT_PURCHASE_PATTERNS = [PUNTOTICKET_QUEUE_PATH, PUNTOTICKET_BUY_PATH];

export function canonicalSourceUrl(value: unknown, label = "source_url", options: SourceUrlOptions = {}): string {
  const host = options.host ?? DEFAULT_HOST;
  if (typeof value !== "string" || value.trim() === "" || hasExternalWhitespace(value)) {
    throw new Error(`${label} es obligatorio y debe ser una URL absoluta de ${host}.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} debe ser una URL absoluta válida de ${host}.`);
  }

  const standardPort = url.port === "" || (url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443");
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== host || !standardPort || url.username !== "" || url.password !== "" || hasUserinfo(value)) {
    throw new Error(`${label} debe usar el host exacto ${host}.`);
  }
  if (hasEncodedPathSeparator(url.pathname)) {
    throw new Error(`${label} no debe incluir separadores de ruta codificados.`);
  }

  url.search = "";
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

export function allowedPurchaseUrl(value: string, baseUrl: string, options: SourceUrlOptions = {}): string | undefined {
  const host = options.host ?? DEFAULT_HOST;
  const patterns = options.purchasePathPatterns ?? DEFAULT_PURCHASE_PATTERNS;
  if (hasExternalWhitespace(value) || hasExternalWhitespace(baseUrl)) return undefined;
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return undefined;
  }
  const standardPort = url.port === "" || url.port === "443";
  if (url.username !== "" || url.password !== "" || hasUserinfo(value, baseUrl)) return undefined;
  if (url.protocol !== "https:" || url.hostname !== host || !standardPort || hasEncodedPathSeparator(url.pathname) || !patterns.some((pattern) => pattern.test(url.pathname))) return undefined;
  return url.href;
}

export function hasUserinfo(value: string, baseUrl?: string): boolean {
  const reference = hasAuthority(value) ? value : baseUrl;
  if (!reference) return false;
  const authority = reference.trimStart().match(/^(?:[a-z][a-z\d+.-]*:)?\/\/([^/?#]*)/i)?.[1];
  return authority?.includes("@") ?? false;
}

export function hasExternalWhitespace(value: string): boolean {
  return /^\s|\s$/u.test(value);
}

export function hasEncodedPathSeparator(pathname: string): boolean {
  return ENCODED_PATH_SEPARATOR.test(pathname);
}

function hasAuthority(value: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(value.trimStart());
}
