import type { EventStatus, NormalizedEvent, RawEventDetail, SourceUrlOptions } from "@mishow/domain";
import type { SourceAdapter } from "./adapter.js";
import type { ExtractedDetail } from "./extraction/detail.js";
import { hasKnownTime, toSantiago } from "@mishow/domain";
import { allowedPurchaseUrl, canonicalSourceUrl } from "@mishow/domain";

export function normalizeEvent(adapter: SourceAdapter, detail: RawEventDetail, extracted: ExtractedDetail, { extracted_at }: { extracted_at: string }): NormalizedEvent {
  if (!isIsoTimestamp(extracted_at)) throw new Error("extracted_at debe ser una fecha ISO-8601 válida.");
  const urlOptions: SourceUrlOptions = { host: adapter.host, purchasePathPatterns: adapter.purchasePathPatterns };
  const sourceUrl = canonicalSourceUrl(detail.source_url, "source_url", urlOptions);
  const performances = extracted.performances.map((performance) => {
    const purchaseUrlValue = performance.purchase_url;
    const hasPurchaseUrl = purchaseUrlValue !== undefined;
    const purchaseUrl = purchaseUrlValue === undefined ? undefined : allowedPurchaseUrl(purchaseUrlValue, sourceUrl, urlOptions);
    return {
      starts_at: toSantiago(performance.date), timezone: "America/Santiago",
      status: !purchaseUrl && hasPurchaseUrl && performance.status === "available" ? "unknown" : performance.status,
      ...(hasKnownTime(performance.date) ? {} : { time_known: false }),
      ...(purchaseUrl ? { purchase_url: purchaseUrl, ...(performance.performance_code ? { performance_code: performance.performance_code } : {}) } : {})
    };
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const purchaseUrl = detail.purchase_url ? allowedPurchaseUrl(detail.purchase_url, sourceUrl, urlOptions) : undefined;
  const imageUrl = validHttpsUrl(extracted.image_url);
  const venue = normalizeVenue(extracted.venue);
  const price = normalizePrice(extracted.price);
  return { source: adapter.source, source_url: sourceUrl, extracted_at, ...(purchaseUrl ? { purchase_url: purchaseUrl } : {}), ...(detail.source_code ? { source_code: detail.source_code } : {}), ...(imageUrl ? { image_url: imageUrl } : {}), name: clean(extracted.name ?? "Evento sin nombre"), artists: [...new Set(extracted.artists.map(clean).filter(Boolean))].sort(), venue, performances, status: overallStatus(performances.map((p) => p.status), detail.availability_evidence?.status ?? extracted.availability_evidence?.status), ...(price ? { price } : {}) };
}

function isIsoTimestamp(value: string): boolean {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|[+-](\d\d):(\d\d))$/);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zone, offsetHour = "00", offsetMinute = "00"] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const daysInMonth = [31, isLeapYear(yearNumber) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthNumber - 1];
  if (!daysInMonth || dayNumber < 1 || dayNumber > daysInMonth) return false;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  if (zone !== "Z" && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) return false;
  return true;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function clean(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function overallStatus(statuses: EventStatus[], evidence?: EventStatus): EventStatus { if (statuses.includes("available") || evidence === "available") return "available"; if (statuses.length && statuses.every((s) => s === "sold_out")) return "sold_out"; if (statuses.includes("upcoming") || evidence === "upcoming") return "upcoming"; return "unknown"; }
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
