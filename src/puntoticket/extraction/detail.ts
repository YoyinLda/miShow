import * as cheerio from "cheerio";
import type { EventStatus, ExtractionResult, RawEventDetail } from "../contracts.js";
import { instantKey } from "../time.js";
import { allowedPurchaseUrl, canonicalSourceUrl } from "../url.js";

const QUEUE = /\/queue\/enqueue\/([^/?#]+)/i;
const FUNCTION_BLOCK_SELECTOR = "[data-performance-date], [data-function-date], [data-event-date], .performance, .funcion, .event-date, [data-function], .button-block";
const PUBLICATION_CODE_SELECTOR = "[data-publication-code], [data-source-code], [data-event-code]";
const statuses: Array<[RegExp, EventStatus]> = [[/agotad|sold[ -]?out/i, "sold_out"], [/pr[oó]ximamente|coming soon|\bpreorder\b|https?:\/\/schema\.org\/preorder(?:\b|$)/i, "upcoming"], [/comprar|disponible|venta|in[ -]?stock/i, "available"]];

export function parseEventDetail(html: string, sourceUrl: string): ExtractionResult<RawEventDetail> {
  const canonicalUrl = canonicalSourceUrl(sourceUrl);
  const $ = cheerio.load(html);
  const jsonLd: unknown[] = [];
  const errors: string[] = [];
  $("script[type='application/ld+json']").each((index, node) => {
    try {
      const parsed = JSON.parse($(node).text());
      jsonLd.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      errors.push(`json_ld_invalid: script ${index + 1}`);
    }
  });
  const sourceCode = publicationCode($);
  const purchaseUrl = publicationPurchaseUrl($, canonicalUrl);
  return { value: { source_url: canonicalUrl, html, json_ld: jsonLd, source_code: sourceCode, purchase_url: purchaseUrl }, errors };
}

export interface ExtractedDetail {
  name?: string; artists: string[]; image_url?: string; venue?: { name?: string; address?: string; city?: string; latitude?: number; longitude?: number };
  performances: Array<{ date: string; status: EventStatus; performance_code?: string; purchase_url?: string }>;
  price?: { min?: number; max?: number; currency?: string };
}

export function extractDetail(detail: RawEventDetail): ExtractionResult<ExtractedDetail> {
  const $ = cheerio.load(detail.html);
  const errors: string[] = [];
  const events = detail.json_ld.flatMap(asEvents);
  const event = events[0] ?? {};
  const artists = unique(events.flatMap((item) => values(item.performer).map(nameOf).filter(Boolean) as string[]));
  const place = event.location && typeof event.location === "object" ? event.location : {};
  const address = place.address && typeof place.address === "object" ? place.address : {};
  const performances: ExtractedDetail["performances"] = [];
  const referenceDate = events.map((item) => item.startDate).find((value): value is string => typeof value === "string");
  $(FUNCTION_BLOCK_SELECTOR).each((_, node) => {
    const current = $(node);
    const text = current.html()?.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").trim() ?? current.text().trim();
    const date = current.attr("data-performance-date") ?? current.attr("data-function-date") ?? current.attr("data-event-date") ?? dateFromSpanish(text, referenceDate);
    if (!date) return;
    const href = current.attr("data-purchase-url") ?? current.find("a[href]").first().attr("href");
    const purchaseUrl = href && allowedPurchaseUrl(href, detail.source_url) ? href : undefined;
    addPerformance(performances, { date, status: statusFrom(current.attr("data-status") ?? text), ...(purchaseUrl ? { performance_code: queueCode(purchaseUrl, detail.source_url), purchase_url: purchaseUrl } : {}) }, errors);
  });
  for (const item of events) {
    for (const subEvent of values(item.subEvent)) {
      if (!isRecord(subEvent) || typeof subEvent.startDate !== "string") continue;
      const purchaseUrl = offerUrl(subEvent.offers, detail.source_url);
      addPerformance(performances, { date: subEvent.startDate, status: statusFrom(offerAvailability(subEvent.offers)), ...(purchaseUrl ? { performance_code: queueCode(purchaseUrl, detail.source_url), purchase_url: purchaseUrl } : {}) }, errors);
    }
    if (typeof item.startDate === "string") {
      const purchaseUrl = offerUrl(item.offers, detail.source_url);
      addPerformance(performances, { date: item.startDate, status: statusFrom(offerAvailability(item.offers)), ...(purchaseUrl ? { performance_code: queueCode(purchaseUrl, detail.source_url), purchase_url: purchaseUrl } : {}) }, errors);
    }
  }
  const geo = place.geo && typeof place.geo === "object" ? place.geo : {};
  const latitude = coordinate(geo.latitude, -90, 90);
  const longitude = coordinate(geo.longitude, -180, 180);
  const venue = { name: place.name, address: address.streetAddress, city: address.addressLocality, ...(latitude !== undefined ? { latitude } : {}), ...(longitude !== undefined ? { longitude } : {}) };
  const imageUrl = image(event.image);
  return { value: { name: event.name ?? ($("h1").first().text().trim() || undefined), artists, ...(imageUrl ? { image_url: imageUrl } : {}), venue, performances, price: priceFrom(events.flatMap(offersInEvent)) }, errors };
}

function statusFrom(value: string): EventStatus { return statuses.find(([pattern]) => pattern.test(value))?.[1] ?? "unknown"; }
function dateFromSpanish(value: string, referenceDate?: string): string | undefined {
  const explicit = dateFrom(value);
  if (explicit || !referenceDate) return explicit;
  const month = value.match(/\b(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i);
  if (!month) return undefined;
  const year = Number(referenceDate.match(/^\d{4}/)?.[0]);
  if (!year) return undefined;
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const monthName = month[2].toLocaleLowerCase();
  const monthNumber = monthName === "setiembre" ? 9 : months.indexOf(monthName) + 1;
  const time = referenceDate.match(/T(\d\d:\d\d(?::\d\d)?)/)?.[1] ?? "00:00:00";
  return `${year}-${String(monthNumber).padStart(2, "0")}-${month[1].padStart(2, "0")}T${time}`;
}
function priceFrom(offers: unknown[]): ExtractedDetail["price"] | undefined {
  const records = offers.filter(isRecord);
  const mins = records.map((offer) => number(offer.lowPrice ?? offer.minPrice ?? offer.price)).filter((value): value is number => value !== undefined);
  const maxs = records.map((offer) => number(offer.highPrice ?? offer.maxPrice ?? offer.price)).filter((value): value is number => value !== undefined);
  if (!mins.length && !maxs.length) return undefined;
  const currencies = records.map((offer) => offer.priceCurrency ?? offer.PriceCurrency ?? offer.currency).find((value): value is string => typeof value === "string");
  return { min: mins.length ? Math.min(...mins) : undefined, max: maxs.length ? Math.max(...maxs) : undefined, ...(currencies ? { currency: currencies } : {}) };
}
function number(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}
function coordinate(value: unknown, min: number, max: number): number | undefined {
  const parsed = number(value);
  return parsed !== undefined && parsed >= min && parsed <= max ? parsed : undefined;
}
function image(value: unknown): string | undefined {
  const candidates = values(value).flatMap((item) => {
    if (typeof item === "string") return [item];
    if (isRecord(item)) return [item.url, item.contentUrl].filter((url): url is string => typeof url === "string");
    return [];
  });
  return candidates.find(isHttpsUrl);
}
function isHttpsUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname); } catch { return false; } }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === "object"); }
function values(value: unknown): unknown[] { return Array.isArray(value) ? value : value === undefined ? [] : [value]; }
function nameOf(value: unknown): string | undefined { return typeof value === "string" ? value : isRecord(value) && typeof value.name === "string" ? value.name : undefined; }
function unique(valuesToDeduplicate: string[]): string[] { return [...new Set(valuesToDeduplicate)]; }
function asEvents(value: unknown): Record<string, any>[] { if (!isRecord(value)) return []; const graph = Array.isArray(value["@graph"]) ? value["@graph"] : [value]; return graph.filter((item): item is Record<string, any> => isRecord(item) && values(item["@type"]).some((type) => type === "Event" || type === "https://schema.org/Event")); }
function dateFrom(value: string): string | undefined { return value.match(/\d{4}-\d\d-\d\d(?:[T ][^\s<]+)?/)?.[0] ?? value.match(/\d{1,2}[/-]\d{1,2}[/-]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/)?.[0]; }
function addPerformance(list: ExtractedDetail["performances"], candidate: ExtractedDetail["performances"][number], errors: string[]): void {
  const candidateInstant = instantKey(candidate.date);
  if (candidateInstant === undefined) {
    errors.push(`invalid_performance_date: ${candidate.date}`);
    return;
  }
  const existing = list.find((item) => {
    if (item.date === candidate.date) return true;
    const existingInstant = instantKey(item.date);
    return existingInstant !== undefined && candidateInstant !== undefined && existingInstant === candidateInstant;
  });
  if (!existing) { list.push(candidate); return; }
  if (existing.status === "unknown" && candidate.status !== "unknown") existing.status = candidate.status;
  if (!existing.performance_code && candidate.performance_code) existing.performance_code = candidate.performance_code;
  if (!existing.purchase_url && candidate.purchase_url) existing.purchase_url = candidate.purchase_url;
}
function queueCode(value: string, baseUrl: string): string | undefined { return allowedPurchaseUrl(value, baseUrl)?.match(QUEUE)?.[1]; }
// Publication identity requires an explicit publication/event marker; function queue links are never evidence for source_code.
function publicationCode($: cheerio.CheerioAPI): string | undefined {
  const explicitCode = $(PUBLICATION_CODE_SELECTOR).filter((_, node) => !$(node).closest(FUNCTION_BLOCK_SELECTOR).length)
    .map((_, node) => $(node).attr("data-publication-code") ?? $(node).attr("data-source-code") ?? $(node).attr("data-event-code") ?? "")
    .get().map((value) => value.trim()).find(Boolean);
  if (explicitCode) return explicitCode;
  return $("meta[name='publication-code'], meta[name='source-code'], meta[name='event-code']")
    .map((_, node) => $(node).attr("content")?.trim() ?? "").get().find(Boolean);
}
function publicationPurchaseUrl($: cheerio.CheerioAPI, baseUrl: string): string | undefined {
  return $("[data-publication-purchase-url], [data-event-purchase-url]")
    .filter((_, node) => !$(node).closest(FUNCTION_BLOCK_SELECTOR).length)
    .map((_, node) => $(node).attr("data-publication-purchase-url") ?? $(node).attr("data-event-purchase-url") ?? "")
    .get().map((value) => allowedPurchaseUrl(value, baseUrl)).find((value): value is string => Boolean(value));
}
function offerAvailability(value: unknown): string { return values(value).map((offer) => isRecord(offer) ? String(offer.availability ?? offer.Availability ?? "") : "").join(" "); }
function offerUrl(value: unknown, baseUrl: string): string | undefined {
  return values(value).map((offer) => isRecord(offer) ? offer.url ?? offer.purchaseUrl ?? offer.purchase_url : undefined)
    .filter((url): url is string => typeof url === "string")
    .find((url) => Boolean(allowedPurchaseUrl(url, baseUrl)));
}
function offersInEvent(event: Record<string, any>): unknown[] { return [...values(event.offers), ...values(event.subEvent).filter(isRecord).flatMap(offersInEvent)]; }
