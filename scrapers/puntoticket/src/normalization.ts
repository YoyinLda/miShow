import type { NormalizedEvent, RawEventDetail } from "@mishow/domain";
import { normalizeEvent as coreNormalizeEvent, type ExtractedDetail } from "@mishow/scraper-core";
import { puntoticketAdapter } from "./adapter.js";

export function normalizeEvent(detail: RawEventDetail, extracted: ExtractedDetail, options: { extracted_at: string }): NormalizedEvent {
  return coreNormalizeEvent(puntoticketAdapter, detail, extracted, options);
}
