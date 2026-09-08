const PUNTOTICKET_HOST = "www.puntoticket.com";
const QUEUE_PATH = /^\/queue\/enqueue\/[^/?#]+$/i;

export function allowedPurchaseUrl(value: string, baseUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return undefined;
  }
  const standardPort = url.port === "" || (url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443");
  if (!["http:", "https:"].includes(url.protocol) || url.hostname.toLowerCase() !== PUNTOTICKET_HOST || !standardPort || !QUEUE_PATH.test(url.pathname)) return undefined;
  return url.href;
}
