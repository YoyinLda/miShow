import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { RawEventReference } from "../contracts.js";

const BASE_URL = "https://www.puntoticket.com";
const EVENT_PATH = /^\/evento\/[A-Za-z0-9-]+\/?$/i;
const NON_EVENT_PATH = /^\/(?:musica|conciertos|festivales|recintos|servicios|contacto|ayuda|login|registro|carrito|queue)(?:\/|$)/i;

export function parseMusicListing(html: string, baseUrl = `${BASE_URL}/musica`): RawEventReference[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const result: RawEventReference[] = [];
  $("a[href]").each((_, element) => {
    const raw = $(element).attr("href");
    if (!raw) return;
    let url: URL;
    try { url = new URL(raw, baseUrl); } catch { return; }
    if (url.origin !== new URL(baseUrl).origin || url.pathname === "/" || NON_EVENT_PATH.test(url.pathname)) return;
    const isCanonicalEvent = EVENT_PATH.test(url.pathname);
    const isStructuredLanding = !isCanonicalEvent && isEventCardLink(element, $);
    if (!isCanonicalEvent && !isStructuredLanding) return;
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const title = $(element).find("h3, [data-event-title]").first().text().trim() || $(element).attr("title")?.trim();
    result.push(title ? { source_url: url.href, title } : { source_url: url.href });
  });
  return result;
}

function isEventCardLink(element: AnyNode, $: cheerio.CheerioAPI): boolean {
  const card = $(element).closest("article, [data-event], [data-event-card], .event-card, .card-event, [class*='event-card']");
  if (!card.length) return false;
  return Boolean(card.find("h1, h2, h3, [data-event-title], time, [data-date], [class*='date']").length);
}
