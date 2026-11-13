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
  for (const record of embeddedEventRecords(html)) {
    const raw = record.href;
    if (hasExternalWhitespace(raw) || hasUserinfo(raw)) continue;
    let url: URL;
    try {
      url = new URL(canonicalSourceUrl(new URL(raw, canonicalPage).href), canonicalPage);
    } catch { continue; }
    if (url.hostname !== HOST || url.origin !== pageOrigin || url.protocol !== "https:" || url.port || url.username || url.password) continue;
    if (url.pathname === "/" || NON_EVENT_PATH.test(url.pathname) || isBlockedPath(url.pathname, "detail")) continue;
    const sourceUrl = canonicalSourceUrl(url.href);
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    result.push(record.title ? { source_url: sourceUrl, title: record.title } : { source_url: sourceUrl });
  }
    return result;
}

/**
 * Las páginas de venue de PuntoTicket se renderizan con Vue: los eventos vienen
 * como JSON embebido (`{"eventoID":...,"urlCompra":"...","tituloEvento":"..."}`),
 * no como tarjetas HTML. Se extrae `urlCompra` de cada registro, sin ejecutar JS.
 */
function embeddedEventRecords(html: string): Array<{ href: string; title?: string }> {
  const records: Array<{ href: string; title?: string }> = [];
  const segments = html.split('{"eventoID"').slice(1);
  for (const segment of segments) {
    const end = segment.indexOf('"productoID"');
    const body = end === -1 ? segment.slice(0, 4000) : segment.slice(0, end);
    const href = jsonStringField(body, "urlCompra");
    if (!href) continue;
    const title = jsonStringField(body, "tituloEvento") || jsonStringField(body, "nombreArtista") || jsonStringField(body, "nombre");
    records.push(title ? { href, title } : { href });
  }
  return records;
}

function jsonStringField(body: string, key: string): string | undefined {
  const match = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`).exec(body);
  if (!match) return undefined;
  try {
    const value = JSON.parse(`"${match[1]}"`) as string;
    return value.trim() || undefined;
  } catch {
    return undefined;
  }
}