const PUNTOTICKET_HOST = "www.puntoticket.com";
const QUEUE_PATH = /^\/queue\/enqueue\/[^/?#]+$/i;
const BUY_PATH = /^\/comprar\/evento\/[^/?#]+\/cal\/[^/?#]+$/i;
const ENCODED_PATH_SEPARATOR = /%2f|%5c/i;

export function canonicalSourceUrl(value: unknown, label = "source_url"): string {
  if (typeof value !== "string" || value.trim() === "" || hasExternalWhitespace(value)) {
    throw new Error(`${label} es obligatorio y debe ser una URL absoluta de PuntoTicket.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} debe ser una URL absoluta válida de PuntoTicket.`);
  }

  const standardPort = url.port === "" || (url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443");
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== PUNTOTICKET_HOST || !standardPort || url.username !== "" || url.password !== "" || hasUserinfo(value)) {
    throw new Error(`${label} debe usar el host exacto www.puntoticket.com.`);
  }
  if (hasEncodedPathSeparator(url.pathname)) {
    throw new Error(`${label} no debe incluir separadores de ruta codificados.`);
  }

  url.search = "";
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

export function allowedPurchaseUrl(value: string, baseUrl: string): string | undefined {
  if (hasExternalWhitespace(value) || hasExternalWhitespace(baseUrl)) return undefined;
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return undefined;
  }
  const standardPort = url.port === "" || url.port === "443";
  if (url.username !== "" || url.password !== "" || hasUserinfo(value, baseUrl)) return undefined;
  if (url.protocol !== "https:" || url.hostname !== PUNTOTICKET_HOST || !standardPort || hasEncodedPathSeparator(url.pathname) || (!QUEUE_PATH.test(url.pathname) && !BUY_PATH.test(url.pathname))) return undefined;
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
