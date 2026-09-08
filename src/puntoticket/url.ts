const PUNTOTICKET_HOST = "www.puntoticket.com";
const QUEUE_PATH = /^\/queue\/enqueue\/[^/?#]+$/i;
const BUY_PATH = /^\/comprar\/evento\/[^/?#]+\/cal\/[^/?#]+$/i;

export function canonicalSourceUrl(value: unknown, label = "source_url"): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} es obligatorio y debe ser una URL absoluta de PuntoTicket.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} debe ser una URL absoluta válida de PuntoTicket.`);
  }

  const standardPort = url.port === "" || (url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443");
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== PUNTOTICKET_HOST || !standardPort || url.username !== "" || url.password !== "") {
    throw new Error(`${label} debe usar el host exacto www.puntoticket.com.`);
  }

  url.search = "";
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

export function allowedPurchaseUrl(value: string, baseUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return undefined;
  }
  const standardPort = url.port === "" || url.port === "443";
  if (url.username !== "" || url.password !== "") return undefined;
  if (url.protocol !== "https:" || url.hostname !== PUNTOTICKET_HOST || !standardPort || (!QUEUE_PATH.test(url.pathname) && !BUY_PATH.test(url.pathname))) return undefined;
  return url.href;
}
