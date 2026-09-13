import * as cheerio from "cheerio";
import type { EventStatus, ExtractionResult, RawEventDetail, SourceUrlOptions } from "@mishow/domain";
import { allowedPurchaseUrl, canonicalSourceUrl, instantKey } from "@mishow/domain";
import type { ExtractedDetail } from "./detail.js";

const statuses: Array<[RegExp, EventStatus]> = [
  [/agotad|sold[ -]?out/i, "sold_out"],
  [/pr[oó]ximamente|coming soon|\bpreorder\b|https?:\/\/schema\.org\/preorder(?:\b|$)/i, "upcoming"],
  [/comprar|disponible|venta|in[ -]?stock/i, "available"]
];

/**
 * Parser JSON-LD schema.org/Event común a las fuentes que exponen el detalle
 * como structured data (PuntoTicket y Ticketmaster comparten el formato). Lee
 * los `<script type="application/ld+json">`, sin lógica de HTML específica de
 * una fuente. Las fuentes con marcado propietario extienden esto por su cuenta.
 */
export function parseJsonLdDetail(html: string, sourceUrl: string, options: SourceUrlOptions = {}): ExtractionResult<RawEventDetail> {
  const canonicalUrl = canonicalSourceUrl(sourceUrl, "source_url", options);
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
  return { value: { source_url: canonicalUrl, html, json_ld: jsonLd }, errors };
}

/**
 * Extrae la forma común (`ExtractedDetail`) desde el JSON-LD de un detalle.
 * Considera `subEvent[]` y el propio evento como funciones, mapea disponibilidad
 * de `offers`, artistas de `performer`, recinto de `location`, precio de las
 * `offers` e imagen. `descriptionDate` permite a una fuente derivar la fecha
 * desde la `description` cuando no hay `startDate` estructurado.
 */
export function extractJsonLdDetail(
  detail: RawEventDetail,
  options: SourceUrlOptions = {},
  hooks: {
    descriptionDate?: (description: string) => string | undefined;
    /** Imagen de respaldo desde el HTML cuando el JSON-LD no trae una válida (p. ej. `og:image`). */
    fallbackImage?: (html: string) => string | undefined;
  } = {}
): ExtractionResult<ExtractedDetail> {
  const errors: string[] = [];
  const events = detail.json_ld.flatMap(asEvents);
  const event = events[0] ?? {};
  const artists = unique(events.flatMap((item) => values(item.performer).map(nameOf).filter(Boolean) as string[]));
  const place = event.location && typeof event.location === "object" ? event.location : {};
  const address = place.address && typeof place.address === "object" ? place.address : {};
  const performances: ExtractedDetail["performances"] = [];

  for (const item of events) {
    for (const subEvent of values(item.subEvent)) {
      if (!isRecord(subEvent)) continue;
      const startDate = eventStartDate(subEvent, hooks.descriptionDate);
      if (!startDate) continue;
      const purchaseUrl = offerUrl(subEvent.offers, detail.source_url, options);
      const status = statusFrom(offerAvailability(subEvent.offers));
      addPerformance(performances, { date: startDate, status: status === "available" && !purchaseUrl ? "unknown" : status, ...(purchaseUrl ? { purchase_url: purchaseUrl } : {}) }, errors);
    }
    const startDate = eventStartDate(item, hooks.descriptionDate);
    if (startDate) {
      const purchaseUrl = offerUrl(item.offers, detail.source_url, options);
      const status = statusFrom(offerAvailability(item.offers));
      addPerformance(performances, { date: startDate, status: status === "available" && !purchaseUrl ? "unknown" : status, ...(purchaseUrl ? { purchase_url: purchaseUrl } : {}) }, errors);
    }
  }

  const geo = place.geo && typeof place.geo === "object" ? place.geo : {};
  const latitude = coordinate(geo.latitude, -90, 90);
  const longitude = coordinate(geo.longitude, -180, 180);
  const venue = { name: place.name, address: address.streetAddress, city: address.addressLocality, ...(latitude !== undefined ? { latitude } : {}), ...(longitude !== undefined ? { longitude } : {}) };
  const jsonLdImage = image(event.image);
  const fallback = !jsonLdImage && hooks.fallbackImage ? hooks.fallbackImage(detail.html) : undefined;
  const imageUrl = jsonLdImage ?? (fallback && isHttpsUrl(fallback) ? fallback : undefined);
  return {
    value: {
      name: event.name ?? undefined,
      artists,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      venue,
      performances,
      price: priceFrom(events.flatMap(offersInEvent))
    },
    errors
  };
}

function eventStartDate(event: Record<string, any>, descriptionDate?: (description: string) => string | undefined): string | undefined {
  if (typeof event.startDate === "string") return event.startDate;
  if (descriptionDate && typeof event.description === "string") return descriptionDate(event.description);
  return undefined;
}

function statusFrom(value: string): EventStatus {
  return statuses.find(([pattern]) => pattern.test(value))?.[1] ?? "unknown";
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

function isHttpsUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname); } catch { return false; }
}

function isRecord(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === "object"); }
function values(value: unknown): unknown[] { return Array.isArray(value) ? value : value === undefined ? [] : [value]; }
function nameOf(value: unknown): string | undefined { return typeof value === "string" ? value : isRecord(value) && typeof value.name === "string" ? value.name : undefined; }
function unique(valuesToDeduplicate: string[]): string[] { return [...new Set(valuesToDeduplicate)]; }
function asEvents(value: unknown): Record<string, any>[] {
  if (!isRecord(value)) return [];
  const graph = Array.isArray(value["@graph"]) ? value["@graph"] : [value];
  return graph.filter((item): item is Record<string, any> => isRecord(item) && values(item["@type"]).some((type) => type === "Event" || type === "https://schema.org/Event"));
}
function offerAvailability(value: unknown): string {
  return values(value).map((offer) => isRecord(offer) ? String(offer.availability ?? offer.Availability ?? "") : "").join(" ");
}
function offerUrl(value: unknown, baseUrl: string, options: SourceUrlOptions): string | undefined {
  return values(value).map((offer) => isRecord(offer) ? offer.url ?? offer.purchaseUrl ?? offer.purchase_url : undefined)
    .filter((url): url is string => typeof url === "string")
    .find((url) => Boolean(allowedPurchaseUrl(url, baseUrl, options)));
}
function offersInEvent(event: Record<string, any>): unknown[] {
  return [...values(event.offers), ...values(event.subEvent).filter(isRecord).flatMap(offersInEvent)];
}
function addPerformance(list: ExtractedDetail["performances"], candidate: ExtractedDetail["performances"][number], errors: string[]): void {
  const candidateInstant = instantKey(candidate.date);
  if (candidateInstant === undefined) {
    errors.push(`invalid_performance_date: ${candidate.date}`);
    return;
  }
  const existing = list.find((item) => {
    if (item.date === candidate.date) return true;
    const existingInstant = instantKey(item.date);
    return existingInstant !== undefined && existingInstant === candidateInstant;
  });
  if (!existing) {
    list.push(candidate);
    return;
  }
  if (statusRank(candidate.status) > statusRank(existing.status)) existing.status = candidate.status;
  if (candidate.purchase_url && !existing.purchase_url) {
    existing.purchase_url = candidate.purchase_url;
    if (candidate.performance_code) existing.performance_code = candidate.performance_code;
  }
}
function statusRank(status: EventStatus): number {
  return status === "available" ? 4 : status === "upcoming" ? 3 : status === "sold_out" ? 2 : 1;
}
