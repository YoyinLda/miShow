import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { RawEventReference, SourceUrlOptions } from "@mishow/domain";
import { canonicalSourceUrl, hasExternalWhitespace, hasUserinfo } from "@mishow/domain";

const HOST = "www.ticketmaster.cl";
const BASE_URL = "https://www.ticketmaster.cl";
const EVENT_PATH = /^\/event\/[A-Za-z0-9._~-]+\/?$/i;
const URL_OPTIONS: SourceUrlOptions = { host: HOST };

/**
 * Extrae las referencias de eventos del listado de Ticketmaster
 * (`/page/musica`). Cada tarjeta es `div.grid_element > a[href*="/event/"]`,
 * con rutas relativas (`../event/<slug>`) que se resuelven contra la base y se
 * canonicalizan; se deduplica por `source_url` canónico. El título sale de
 * `.item_title` con fallback al `alt` de la imagen o al `title` del enlace; el
 * recinto sale de `.grid-label`.
 */
export function parseMusicListing(html: string, baseUrl = `${BASE_URL}/page/musica`): RawEventReference[] {
  const canonicalBaseUrl = canonicalSourceUrl(baseUrl, "base-url", URL_OPTIONS);
  const baseOrigin = new URL(canonicalBaseUrl).origin;
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const result: RawEventReference[] = [];
  $("div.grid_element a[href*='/event/']").each((_, element) => {
    const raw = $(element).attr("href");
    if (!raw || hasExternalWhitespace(raw)) return;
    let url: URL;
    try {
      if (hasUserinfo(raw)) return;
      url = new URL(canonicalSourceUrl(new URL(raw, canonicalBaseUrl).href, "source_url", URL_OPTIONS), canonicalBaseUrl);
    } catch { return; }
    if (url.hostname !== HOST || url.origin !== baseOrigin || !EVENT_PATH.test(url.pathname)) return;
    const sourceUrl = canonicalSourceUrl(url.href, "source_url", URL_OPTIONS);
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);
    const title = eventTitle($, element);
    result.push(title ? { source_url: sourceUrl, title } : { source_url: sourceUrl });
  });
  return result;
}

function eventTitle($: cheerio.CheerioAPI, element: AnyNode): string | undefined {
  const link = $(element);
  const card = link.closest("div.grid_element");
  const scope = card.length ? card : link;
  const fromTitle = scope.find(".item_title").first().text().trim();
  if (fromTitle) return clean(fromTitle);
  const fromAlt = scope.find("img[alt]").first().attr("alt")?.trim();
  if (fromAlt) return clean(fromAlt);
  const fromLinkTitle = link.attr("title")?.trim();
  return fromLinkTitle ? clean(fromLinkTitle) : undefined;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
