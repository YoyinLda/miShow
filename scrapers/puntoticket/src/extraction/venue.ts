import * as cheerio from "cheerio";
import type { RawEventReference } from "@mishow/domain";
import { canonicalSourceUrl, hasExternalWhitespace, hasUserinfo } from "@mishow/domain";
import { isBlockedPath } from "../paths.js";
import { EVENT_PATH, eventTitle, isEventCardLink } from "./listing.js";

const HOST = "www.puntoticket.com";
// Páginas de venue/listado/servicio: nunca son destino de evento.
const NON_EVENT_PATH = /^\/(?:recintos?|venues?|musica|conciertos|festivales|servicios|contacto|ayuda|login|registro|carrito|queue)(?:\/|$)/i;

/** Extrae referencias de evento de una página de venue (base = pageUrl). */
export function parseVenuePage(html: string, pageUrl: string): RawEventReference[] {
  const canonicalPage = canonicalSourceUrl(pageUrl, "page-url");
  const pageOrigin = new URL(canonicalPage).origin;
  const $ = cheerio.load(html);
  const seen = new Set<string>([canonicalPage]);
  const result: RawEventReference[] = [];
  $("a[href]").each((_, element) => {
    const raw = $(element).attr("href");
    if (!raw || hasExternalWhitespace(raw) || hasUserinfo(raw)) return;
    let url: URL;
    try {
      url = new URL(canonicalSourceUrl(new URL(raw, canonicalPage).href), canonicalPage);
    } catch { return; }
    if (url.hostname !== HOST || url.origin !== pageOrigin || url.protocol !== "https:" || url.port || url.username || url.password) return;
    if (url.pathname === "/" || NON_EVENT_PATH.test(url.pathname)) return;
    const isCanonicalEvent = EVENT_PATH.test(url.pathname);
    if (!isCanonicalEvent && (isBlockedPath(url.pathname, "detail") || !isEventCardLink(element, $))) return;
    const sourceUrl = canonicalSourceUrl(url.href);
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);
    const title = eventTitle($, element);
    result.push(title ? { source_url: sourceUrl, title } : { source_url: sourceUrl });
  });
  return result;
}
