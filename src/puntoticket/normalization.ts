import type { EventStatus, NormalizedEvent, RawEventDetail } from "./contracts.js";
import type { ExtractedDetail } from "./extraction/detail.js";
import { toSantiago } from "./time.js";
import { allowedPurchaseUrl } from "./url.js";

export function normalizeEvent(detail: RawEventDetail, extracted: ExtractedDetail): NormalizedEvent {
  const performances = extracted.performances.map((performance) => ({
    starts_at: toSantiago(performance.date), timezone: "America/Santiago", status: performance.status,
    ...(performance.performance_code ? { performance_code: performance.performance_code } : {}),
    ...(performance.purchase_url ? (() => { const url = allowedPurchaseUrl(performance.purchase_url!, detail.source_url); return url ? { purchase_url: url } : {}; })() : {})
  }));
  const purchaseUrl = detail.purchase_url ? allowedPurchaseUrl(detail.purchase_url, detail.source_url) : undefined;
  return { source: "puntoticket", source_url: detail.source_url, ...(purchaseUrl ? { purchase_url: purchaseUrl } : {}), source_code: detail.source_code, name: clean(extracted.name ?? "Evento sin nombre"), artists: [...new Set(extracted.artists.map(clean).filter(Boolean))].sort(), venue: extracted.venue, performances, status: overallStatus(performances.map((p) => p.status)), price: extracted.price };
}

function clean(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function overallStatus(statuses: EventStatus[]): EventStatus { if (statuses.includes("available")) return "available"; if (statuses.length && statuses.every((s) => s === "sold_out")) return "sold_out"; if (statuses.includes("upcoming")) return "upcoming"; return "unknown"; }
