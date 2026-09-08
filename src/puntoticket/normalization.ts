import type { EventStatus, NormalizedEvent, RawEventDetail } from "./contracts.js";
import type { ExtractedDetail } from "./extraction/detail.js";
import { toSantiago } from "./time.js";
import { allowedPurchaseUrl, canonicalSourceUrl } from "./url.js";

export function normalizeEvent(detail: RawEventDetail, extracted: ExtractedDetail, { extracted_at }: { extracted_at: string }): NormalizedEvent {
  if (!isIsoTimestamp(extracted_at)) throw new Error("extracted_at debe ser una fecha ISO-8601 válida.");
  const sourceUrl = canonicalSourceUrl(detail.source_url);
  const performances = extracted.performances.map((performance) => ({
    starts_at: toSantiago(performance.date), timezone: "America/Santiago", status: performance.status,
    ...(performance.performance_code ? { performance_code: performance.performance_code } : {}),
    ...(performance.purchase_url ? (() => { const url = allowedPurchaseUrl(performance.purchase_url!, sourceUrl); return url ? { purchase_url: url } : {}; })() : {})
  })).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const purchaseUrl = detail.purchase_url ? allowedPurchaseUrl(detail.purchase_url, sourceUrl) : undefined;
  const imageUrl = validHttpsUrl(extracted.image_url);
  const venue = normalizeVenue(extracted.venue);
  const price = normalizePrice(extracted.price);
  return { source: "puntoticket", source_url: sourceUrl, extracted_at, ...(purchaseUrl ? { purchase_url: purchaseUrl } : {}), ...(detail.source_code ? { source_code: detail.source_code } : {}), ...(imageUrl ? { image_url: imageUrl } : {}), name: clean(extracted.name ?? "Evento sin nombre"), artists: [...new Set(extracted.artists.map(clean).filter(Boolean))].sort(), venue, performances, status: overallStatus(performances.map((p) => p.status)), ...(price ? { price } : {}) };
}

function isIsoTimestamp(value: string): boolean {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
}

function clean(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function overallStatus(statuses: EventStatus[]): EventStatus { if (statuses.includes("available")) return "available"; if (statuses.length && statuses.every((s) => s === "sold_out")) return "sold_out"; if (statuses.includes("upcoming")) return "upcoming"; return "unknown"; }
function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
function validHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname) ? url.href : undefined; } catch { return undefined; }
}
function normalizeVenue(venue: ExtractedDetail["venue"]): NormalizedEvent["venue"] {
  if (!venue) return undefined;
  const latitude = finiteNumber(venue.latitude);
  const longitude = finiteNumber(venue.longitude);
  return { ...venue, ...(latitude !== undefined && latitude >= -90 && latitude <= 90 ? { latitude } : { latitude: undefined }), ...(longitude !== undefined && longitude >= -180 && longitude <= 180 ? { longitude } : { longitude: undefined }) };
}
function normalizePrice(price: ExtractedDetail["price"]): NormalizedEvent["price"] | undefined {
  if (!price) return undefined;
  const min = finiteNumber(price.min);
  const max = finiteNumber(price.max);
  if (min === undefined && max === undefined) return undefined;
  return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(typeof price.currency === "string" && price.currency.trim() ? { currency: price.currency } : {}) };
}
