import type { NormalizedEvent, RawEventReference } from "@mishow/domain";
import type { SourceAdapter } from "../adapter.js";
import { normalizeEvent } from "../normalization.js";
import {
  buildDiscoveryReport,
  canonicalKey,
  classifyMerged,
  mergeReferences,
  type DiscoveryOptions,
  type DiscoveryReport,
  type MergedReference
} from "./discovery.js";
import { HttpAcquisitionError, HttpClient } from "./http.js";
import { AcquisitionPolicyError, acquisitionConfig, type AcquisitionConfig, safeUrlForError, validateAcquisitionUrl } from "./policy.js";

export type AcquisitionErrorStage = "listing" | "detail" | "parse" | "normalize" | "persist";

export interface ScrapeError {
  stage: AcquisitionErrorStage;
  source_url?: string;
  code: string;
  message: string;
  attempts: number;
}

export interface ScrapeResult {
  source: string;
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
  errors: ScrapeError[];
  /** Presente solo si el descubrimiento secundario se ejecutó. */
  discovery?: DiscoveryReport;
}

export interface ScraperOptions {
  adapter: SourceAdapter;
  config?: Partial<AcquisitionConfig>;
  client: HttpClient;
  now: () => Date;
  discovery?: DiscoveryOptions;
}

export async function scrape(options: ScraperOptions): Promise<ScrapeResult> {
  const adapter = options.adapter;
  const config = acquisitionConfig(adapter, options.config);
  const startedAt = options.now().toISOString();
  const listingUrl = validateAcquisitionUrl(adapter, config.listingUrl, "listing");
  let listingHtml: string;
  try {
    listingHtml = await options.client.getHtml(listingUrl, "listing");
  } catch (error) {
    throw globalFailure(error);
  }

  let references: RawEventReference[];
  try {
    references = adapter.parseListing(listingHtml, listingUrl);
  } catch (error) {
    throw globalFailure(error);
  }

  let discoveryReport: DiscoveryReport | undefined;
  let discoveryErrors: ScrapeError[] = [];
  let categories = new Map<string, string>();
  if (options.discovery?.enabled && adapter.discovery) {
    const outcome = await runSecondaryDiscovery(options, config.concurrency, references);
    references = outcome.references;
    discoveryReport = outcome.report;
    discoveryErrors = outcome.errors;
    const classified = await classifyByCategoryListings(options, config.concurrency, outcome.merged);
    categories = classified.categories;
    discoveryErrors.push(...classified.errors);
  }

  const eligibleReferences = references.flatMap((reference) => {
    const detailContext = { discoveredDetailUrl: reference.source_url };
    try {
      return [{ reference, detailContext, detailUrl: validateAcquisitionUrl(adapter, reference.source_url, "detail", undefined, detailContext) }];
    } catch (error) {
      if (error instanceof AcquisitionPolicyError) return [];
      throw error;
    }
  });

  const selected = eligibleReferences.slice(0, config.maxEvents);
  const detailResults = await mapStable(selected, config.concurrency, async ({ reference, detailContext, detailUrl }) => {
    const sourceUrl = safeUrlForError(reference.source_url);
    try {
      const html = await options.client.getHtml(detailUrl, "detail", detailContext);
      const parsed = adapter.parseDetail(html, detailUrl);
      if (!parsed.value) return { errors: [scrapeError("parse", sourceUrl, "parse_error", "No se pudo extraer el detalle.", 1)] };
      const extracted = adapter.extractDetail(parsed.value);
      const parserErrors = [...parsed.errors, ...extracted.errors].map((message) => scrapeError("parse", sourceUrl, "parser_warning", message, 1));
      if (!extracted.value) return { errors: [...parserErrors, scrapeError("normalize", sourceUrl, "normalize_error", "No se pudo normalizar el detalle extraido.", 1)] };
      const normalized = normalizeEvent(adapter, parsed.value, extracted.value, { extracted_at: startedAt });
      const category = categories.get(canonicalKey(adapter, reference.source_url) ?? reference.source_url);
      const event = category ? { ...normalized, category } : normalized;
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
  const errors = [...discoveryErrors, ...detailResults.flatMap((result) => result.errors)];
  const finishedAt = options.now().toISOString();
  return {
    source: adapter.source,
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
    errors,
    ...(discoveryReport ? { discovery: discoveryReport } : {})
  };
}

async function runSecondaryDiscovery(
  options: ScraperOptions,
  concurrency: number,
  musica: RawEventReference[]
): Promise<{ references: RawEventReference[]; merged: MergedReference[]; report: DiscoveryReport; errors: ScrapeError[] }> {
  const adapter = options.adapter;
  const secondary = adapter.discovery!;
  const context = { secondaryListing: true };
  const errors: ScrapeError[] = [];
  const budget = Math.max(0, Math.min(Math.floor(options.discovery!.maxPages), Math.floor(options.discovery!.maxPagesLimit)));

  let pages: string[] = [];
  try {
    const candidates = await secondary.index.list({ getHtml: (url) => options.client.getHtml(url, "listing", context) });
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const key = canonicalKey(adapter, candidate) ?? candidate;
      if (seen.has(key)) continue;
      seen.add(key);
      pages.push(key);
    }
    pages = pages.slice(0, budget);
    for (const rejection of secondary.index.rejections?.() ?? []) {
      const base = scrapeError("listing", "", rejection.code, rejection.message, 1);
      if (rejection.source_url) base.source_url = safeUrlForError(rejection.source_url);
      else delete base.source_url;
      errors.push(base);
    }
  } catch (error) {
    pages = [];
    errors.push({
      stage: "listing",
      code: "venue_index_failed",
      message: error instanceof HttpAcquisitionError ? clean(`${error.code}: ${error.message}`) : safeMessage(error),
      attempts: error instanceof HttpAcquisitionError ? error.attempts : 1
    });
  }

  const results = await mapStable(pages, concurrency, async (page) => {
    const sourceUrl = safeUrlForError(page);
    try {
      const url = validateAcquisitionUrl(adapter, page, "listing", undefined, context);
      const html = await options.client.getHtml(url, "listing", context);
      try {
        return { page: sourceUrl, status: 200, refs: secondary.parsePage(html, url) };
      } catch (error) {
        return { page: sourceUrl, status: 200, error: scrapeError("parse", sourceUrl, "parse_error", safeMessage(error), 1) };
      }
    } catch (error) {
      if (error instanceof HttpAcquisitionError) return { page: sourceUrl, failedStatus: error.status, error: scrapeError("listing", sourceUrl, error.code, error.message, error.attempts) };
      if (error instanceof AcquisitionPolicyError) return { page: sourceUrl, error: scrapeError("listing", sourceUrl, error.code, error.message, 1) };
      return { page: sourceUrl, error: scrapeError("listing", sourceUrl, "venue_page_failed", safeMessage(error), 1) };
    }
  });

  try {
    secondary.index.reportPages?.(
      results.map((r) => ({
        url: r.page,
        ok: r.status === 200,
        ...(r.failedStatus !== undefined ? { status: r.failedStatus } : {})
      }))
    );
  } catch {
    // El hook es informativo; un fallo no debe romper la corrida.
  }

  const ok = results.flatMap((r) => (r.refs ? [{ page: r.page, refs: r.refs }] : []));
  errors.push(...results.flatMap((r) => (r.error ? [r.error] : [])));
  const merged = mergeReferences(adapter, musica, ok);
  const report = buildDiscoveryReport(merged, { requested: results.length, succeeded: ok.length, failed: results.length - ok.length });
  return { references: merged.map((m) => m.reference), merged, report, errors };
}

/**
 * Lee los listados de categorías no musicales (solo si hay eventos que llegaron
 * únicamente por páginas secundarias) y clasifica las referencias (brief 007).
 * Respeta la misma concurrencia y cliente HTTP (límites de cortesía).
 */
async function classifyByCategoryListings(
  options: ScraperOptions,
  concurrency: number,
  merged: MergedReference[]
): Promise<{ categories: Map<string, string>; errors: ScrapeError[] }> {
  const adapter = options.adapter;
  const listings = adapter.discovery?.categoryListings ?? [];
  const venueOnly = merged.some((item) => !item.origins.includes("musica"));
  if (listings.length === 0 || !venueOnly) return { categories: classifyMerged(merged, new Map(), true), errors: [] };

  const context = { categoryListing: true };
  const results = await mapStable([...listings], concurrency, async (listing) => {
    const sourceUrl = safeUrlForError(listing.url);
    try {
      const url = validateAcquisitionUrl(adapter, listing.url, "listing", undefined, context);
      const html = await options.client.getHtml(url, "listing", context);
      return { category: listing.category, refs: adapter.parseListing(html, url) };
    } catch (error) {
      if (error instanceof HttpAcquisitionError) return { error: scrapeError("listing", sourceUrl, "category_listing_failed", `${error.code}: ${error.message}`, error.attempts) };
      return { error: scrapeError("listing", sourceUrl, "category_listing_failed", safeMessage(error), 1) };
    }
  });

  const categoryByUrl = new Map<string, string>();
  for (const result of results) {
    for (const ref of result.refs ?? []) {
      const key = canonicalKey(adapter, ref.source_url);
      if (key && !categoryByUrl.has(key)) categoryByUrl.set(key, result.category!);
    }
  }
  const errors = results.flatMap((result) => (result.error ? [result.error] : []));
  return { categories: classifyMerged(merged, categoryByUrl, errors.length === 0), errors };
}

function globalFailure(error: unknown): Error {
  if (error instanceof HttpAcquisitionError) return new Error(`${error.code}: ${error.message}`);
  return new Error(safeMessage(error));
}

function scrapeError(stage: AcquisitionErrorStage, sourceUrl: string, code: string, message: string, attempts: number): ScrapeError {
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
