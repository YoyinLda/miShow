import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { RawEventReference } from "@mishow/domain";
import { canonicalSourceUrl, hasExternalWhitespace, hasUserinfo } from "@mishow/domain";

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
    if (!raw || hasExternalWhitespace(raw)) return;
    let url: URL;
    try {
      if (hasUserinfo(raw)) return;
      url = new URL(canonicalSourceUrl(new URL(raw, canonicalBaseUrl).href), canonicalBaseUrl);
    } catch { return; }
    if (url.hostname !== "www.puntoticket.com" || url.origin !== new URL(canonicalBaseUrl).origin || url.pathname === "/" || NON_EVENT_PATH.test(url.pathname)) return;
    const isCanonicalEvent = EVENT_PATH.test(url.pathname);
    const isStructuredLanding = !isCanonicalEvent && isEventCardLink(element, $);
    if (!isCanonicalEvent && !isStructuredLanding) return;
    const sourceUrl = canonicalSourceUrl(url.href);
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);
    const title = eventTitle($, element);
    result.push(title ? { source_url: sourceUrl, title } : { source_url: sourceUrl });
  });
  return result;
}

// Reconoce el enlace de una tarjeta de evento. Cubre la estructura real de
// PuntoTicket (`article.filtr-item.event-item`, con `img.img--evento`) además de
// las señales estructurales genéricas (encabezado/fecha en un contenedor de
// tarjeta) usadas por fixtures y otras variantes de listado.
// Resuelve el título de la tarjeta desde el propio enlace o su tarjeta contenedora.
// Prioriza encabezados y `data-event-title`; cae a `alt` de la imagen o `title`.
function eventTitle($: cheerio.CheerioAPI, element: AnyNode): string | undefined {
  const link = $(element);
  const card = link.closest("article.event-item, .filtr-item.event-item, .evento--box, article, [data-event-card], .event-card");
  const scope = card.length ? card : link;
  const fromHeading = scope.find("h1, h2, h3, [data-event-title]").first().text().trim();
  if (fromHeading) return fromHeading;
  const fromAlt = scope.find("img.img--evento[alt], img[alt]").first().attr("alt")?.trim();
  if (fromAlt) return fromAlt;
  return link.attr("title")?.trim() || undefined;
}

function isEventCardLink(element: AnyNode, $: cheerio.CheerioAPI): boolean {
  const card = $(element).closest(
    "article.event-item, .filtr-item.event-item, .evento--box, article, [data-event], [data-event-card], .event-card, .card-event, [class*='event-card']"
  );
  if (!card.length) return false;
  if (card.is("article.event-item, .filtr-item.event-item, .evento--box") || card.find(".img--evento, [data-event-title]").length) return true;
  return Boolean(card.find("h1, h2, h3, time, [data-date], [class*='date']").length);
}
