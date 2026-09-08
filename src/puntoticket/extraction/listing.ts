import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { RawEventReference } from "../contracts.js";
import { canonicalSourceUrl } from "../url.js";

const BASE_URL = "https://www.puntoticket.com";
const EVENT_PATH = /^\/evento\/[A-Za-z0-9-]+\/?$/i;
const NON_EVENT_PATH = /^\/(?:musica|conciertos|festivales|recintos|servicios|contacto|ayuda|login|registro|carrito|queue)(?:\/|$)/i;

export function parseMusicListing(html: string, baseUrl = `${BASE_URL}/musica`): RawEventReference[] {
  const canonicalBaseUrl = canonicalSourceUrl(baseUrl, "base-url");
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const result: RawEventReference[] = [];
  $("a[href]").each((_, element) => {
    const raw = $(element).attr("href");
    if (!raw) return;
    let url: URL;
    try { url = new URL(canonicalSourceUrl(new URL(raw, canonicalBaseUrl).href), canonicalBaseUrl); } catch { return; }
    if (url.hostname !== "www.puntoticket.com" || url.origin !== new URL(canonicalBaseUrl).origin || url.pathname === "/" || NON_EVENT_PATH.test(url.pathname)) return;
    const isCanonicalEvent = EVENT_PATH.test(url.pathname);
    const isStructuredLanding = !isCanonicalEvent && isEventCardLink(element, $);
    if (!isCanonicalEvent && !isStructuredLanding) return;
    const sourceUrl = canonicalSourceUrl(url.href);
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);
    const title = $(element).find("h3, [data-event-title]").first().text().trim() || $(element).attr("title")?.trim();
    result.push(title ? { source_url: sourceUrl, title } : { source_url: sourceUrl });
  });
  return result;
}

function isEventCardLink(element: AnyNode, $: cheerio.CheerioAPI): boolean {
  const card = $(element).closest("article, [data-event], [data-event-card], .event-card, .card-event, [class*='event-card']");
  if (!card.length) return false;
  return Boolean(card.find("h1, h2, h3, [data-event-title], time, [data-date], [class*='date']").length);
}
