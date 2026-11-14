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
  /** Estado HTTP de la causa (solo con `resilience`). */
  http_status?: number;
}

/** Salud de la corrida (solo con `resilience`; D1/D2 del bugfix ticketmaster-scrape-failures). */
export type ScrapeHealth = "ok" | "degraded" | "failed";

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
    /** Conteo de errores de detalle por código (solo con `resilience`). */
    failure_breakdown?: Record<string, number>;
  };
  events: NormalizedEvent[];
  errors: ScrapeError[];
  /** Presente solo si el descubrimiento secundario se ejecutó. */
  discovery?: DiscoveryReport;
  /** Presente solo con `resilience`: fuerza el estado persistido (degraded → partial, failed → failed). */
  health?: ScrapeHealth;
}

/**
 * Falla global de la corrida con su causa real (solo con `resilience`): la
 * persistencia registra `code`, `stage` y `attempts` en vez de
 * `global_acquisition_failure`.
 */
export class ScrapeStageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly stage: AcquisitionErrorStage,
    readonly attempts: number,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = "ScrapeStageError";
  }
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
  const resilience = config.resilience;
  let listingHtml: string;
  try {
    listingHtml = await options.client.getHtml(listingUrl, "listing");
  } catch (error) {
    throw globalFailure(error, resilience !== undefined);
  }

  let references: RawEventReference[];
  try {
    references = adapter.parseListing(listingHtml, listingUrl);
  } catch (error) {
    throw globalFailure(error, resilience !== undefined);
  }

  // D2: listado sano pero sin referencias => la corrida no puede ser `succeeded`.
  const listingErrors: ScrapeError[] = [];
  if (resilience && references.length === 0) {
    throw new ScrapeStageError("listing_empty", "El listado no entrego referencias de eventos (posible cambio de HTML).", "listing", 1);
  }
  if (resilience?.minListingRefs !== undefined && references.length < resilience.minListingRefs) {
    listingErrors.push(scrapeError("listing", listingUrl, "listing_degraded", `El listado entrego ${references.length} referencias (minimo ${resilience.minListingRefs}).`, 1));
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
      // Con `resilience`: un detalle sin nombre ni funciones (p. ej. sin JSON-LD) es una falla,
      // no un "Evento sin nombre" persistido como éxito.
      if (resilience && !extracted.value.name?.trim() && extracted.value.performances.length === 0) {
        return { errors: [...parserErrors, scrapeError("parse", sourceUrl, "incomplete_detail", "Detalle sin nombre ni funciones (posible cambio de HTML o JSON-LD ausente).", 1)] };
      }
      const normalized = normalizeEvent(adapter, parsed.value, extracted.value, { extracted_at: startedAt });
      const category = categories.get(canonicalKey(adapter, reference.source_url) ?? reference.source_url);
      const event = category ? { ...normalized, category } : normalized;
      return { event, errors: parserErrors };
    } catch (error) {
      if (error instanceof HttpAcquisitionError) {
        const detailError = scrapeError("detail", sourceUrl, error.code, error.message, error.attempts);
        if (resilience && error.status !== undefined) detailError.http_status = error.status;
        return { errors: [detailError] };
      }
      if (error instanceof AcquisitionPolicyError) {
        return { errors: [scrapeError("detail", sourceUrl, error.code, error.message, 1)] };
      }
      return { errors: [scrapeError("normalize", sourceUrl, "normalize_error", safeMessage(error), 1)] };
    }
  });

  const events = detailResults.flatMap((result) => result.event ? [result.event] : []);
  const detailErrors = detailResults.flatMap((result) => result.errors);
  const errors = [...listingErrors, ...discoveryErrors, ...detailErrors];
  const finishedAt = options.now().toISOString();
  const failed = selected.length - events.length;
  const summary: ScrapeResult["summary"] = {
    discovered: references.length,
    attempted: selected.length,
    succeeded: events.length,
    failed
  };

  let health: ScrapeHealth | undefined;
  if (resilience) {
    // D1: salud por ratio de detalles fallidos; listado bajo el mínimo => al menos degradada.
    summary.failure_breakdown = breakdown(detailErrors.filter((error) => error.code !== "parser_warning"));
    const ratio = selected.length === 0 ? 0 : failed / selected.length;
    health = "ok";
    if (resilience.failedRatio !== undefined && ratio >= resilience.failedRatio) health = "failed";
    else if ((resilience.degradedRatio !== undefined && ratio >= resilience.degradedRatio) || listingErrors.length > 0) health = "degraded";
    if (health !== "ok" && failed > 0) {
      errors.push(scrapeError("detail", listingUrl, "degraded_details", `Fallaron ${failed} de ${selected.length} detalles: ${JSON.stringify(summary.failure_breakdown)}.`, 1));
    }
  }

  return {
    source: adapter.source,
    started_at: startedAt,
    finished_at: finishedAt,
    listing_url: listingUrl,
    summary,
    events,
    errors,
    ...(discoveryReport ? { discovery: discoveryReport } : {}),
    ...(health ? { health } : {})
  };
}

function breakdown(errors: ScrapeError[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const error of errors) counts[error.code] = (counts[error.code] ?? 0) + 1;
  return counts;
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

function globalFailure(error: unknown, resilient = false): Error {
  if (error instanceof HttpAcquisitionError) {
    const message = `${error.code}: ${error.message}`;
    return resilient ? new ScrapeStageError(error.code, message, "listing", error.attempts, error.status) : new Error(message);
  }
  return resilient ? new ScrapeStageError("parse_error", safeMessage(error), "listing", 1) : new Error(safeMessage(error));
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
