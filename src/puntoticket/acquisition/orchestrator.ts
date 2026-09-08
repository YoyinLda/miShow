import type { NormalizedEvent, RawEventReference } from "../contracts.js";
import { extractDetail, parseEventDetail } from "../extraction/detail.js";
import { parseMusicListing } from "../extraction/listing.js";
import { normalizeEvent } from "../normalization.js";
import { HttpAcquisitionError, PuntoTicketHttpClient } from "./http.js";
import { AcquisitionPolicyError, acquisitionConfig, type AcquisitionConfig, safeUrlForError, validateAcquisitionUrl } from "./policy.js";

export type AcquisitionErrorStage = "listing" | "detail" | "parse" | "normalize";

export interface PuntoticketScrapeError {
  stage: AcquisitionErrorStage;
  source_url?: string;
  code: string;
  message: string;
  attempts: number;
}

export interface PuntoticketScrapeResult {
  source: "puntoticket";
  started_at: string;
  finished_at: string;
  listing_url: string;
  summary: {
    discovered: number;
    attempted: number;
    succeeded: number;
    failed: number;
  };
  events: NormalizedEvent[];
  errors: PuntoticketScrapeError[];
}

export interface PuntoticketScraperOptions {
  config?: Partial<AcquisitionConfig>;
  client: PuntoTicketHttpClient;
  now: () => Date;
}

export async function scrapePuntoTicket(options: PuntoticketScraperOptions): Promise<PuntoticketScrapeResult> {
  const config = acquisitionConfig(options.config);
  const startedAt = options.now().toISOString();
  const listingUrl = validateAcquisitionUrl(config.listingUrl, "listing");
  let listingHtml: string;
  try {
    listingHtml = await options.client.getHtml(listingUrl, "listing");
  } catch (error) {
    throw globalFailure(error);
  }

  let references: RawEventReference[];
  try {
    references = parseMusicListing(listingHtml, listingUrl);
  } catch (error) {
    throw globalFailure(error);
  }

  const selected = references.slice(0, config.maxEvents);
  const detailResults = await mapStable(selected, config.concurrency, async (reference) => {
    const sourceUrl = safeUrlForError(reference.source_url);
    try {
      const detailUrl = validateAcquisitionUrl(reference.source_url, "detail");
      const html = await options.client.getHtml(detailUrl, "detail");
      const parsed = parseEventDetail(html, detailUrl);
      if (!parsed.value) return { errors: [scrapeError("parse", sourceUrl, "parse_error", "No se pudo extraer el detalle.", 1)] };
      const extracted = extractDetail(parsed.value);
      const parserErrors = [...parsed.errors, ...extracted.errors].map((message) => scrapeError("parse", sourceUrl, "parser_warning", message, 1));
      if (!extracted.value) return { errors: [...parserErrors, scrapeError("normalize", sourceUrl, "normalize_error", "No se pudo normalizar el detalle extraido.", 1)] };
      const event = normalizeEvent(parsed.value, extracted.value, { extracted_at: startedAt });
      return { event, errors: parserErrors };
    } catch (error) {
      if (error instanceof HttpAcquisitionError) {
        return { errors: [scrapeError("detail", sourceUrl, error.code, error.message, error.attempts)] };
      }
      if (error instanceof AcquisitionPolicyError) {
        return { errors: [scrapeError("detail", sourceUrl, error.code, error.message, 1)] };
      }
      return { errors: [scrapeError("normalize", sourceUrl, "normalize_error", safeMessage(error), 1)] };
    }
  });

  const events = detailResults.flatMap((result) => result.event ? [result.event] : []);
  const errors = detailResults.flatMap((result) => result.errors);
  const finishedAt = options.now().toISOString();
  return {
    source: "puntoticket",
    started_at: startedAt,
    finished_at: finishedAt,
    listing_url: listingUrl,
    summary: {
      discovered: references.length,
      attempted: selected.length,
      succeeded: events.length,
      failed: selected.length - events.length
    },
    events,
    errors
  };
}

function globalFailure(error: unknown): Error {
  if (error instanceof HttpAcquisitionError) return new Error(`${error.code}: ${error.message}`);
  return new Error(safeMessage(error));
}

function scrapeError(stage: AcquisitionErrorStage, sourceUrl: string, code: string, message: string, attempts: number): PuntoticketScrapeError {
  return { stage, source_url: sourceUrl, code, message: clean(message), attempts };
}

async function mapStable<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function safeMessage(error: unknown): string {
  return error instanceof Error && error.message ? clean(error.message.split("\n")[0]) : "Error de adquisicion.";
}

function clean(value: string): string {
  return value.replace(/https?:\/\/[^@\s]+:[^@\s]+@/g, "https://").replace(/\s+/g, " ").trim();
}
