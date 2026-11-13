import type { SecondaryIndexSource, SecondaryPageResult } from "@mishow/scraper-core";
import { canonicalSourceUrl } from "@mishow/domain";

const SOURCE = "puntoticket" as const;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BASE = "https://www.puntoticket.com/";
const DAY_MS = 86_400_000;

/** Días tras los cuales se reintenta una página `not_found`. */
export const DEFAULT_NOT_FOUND_RETRY_DAYS = 30;

export type VenueSourceState = "candidate" | "active" | "not_found";

export interface VenueSourceRow {
  source_slug: string;
  source_url: string;
  /** Ausente => "candidate". */
  status?: VenueSourceState;
  last_checked_at?: string | null;
}

export type VenueSourcesLoader = (source: typeof SOURCE) => Promise<VenueSourceRow[]>;

/** Fila de `venue_sources` omitida; equivale a un error `url_rejected` (stage `listing`). */
export interface RejectedVenueRow {
  code: "url_rejected";
  stage: "listing";
  source_slug: string;
  source_url: string;
  message: string;
}

/** Verificación a persistir en `venue_sources` tras la corrida. */
export interface PendingVenueCheck {
  source_slug: string;
  status: "active" | "not_found";
}

export interface DbVenuesOptions {
  now?: () => Date;
  notFoundRetryDays?: number;
}

export interface DbVenuesIndex extends SecondaryIndexSource {
  readonly kind: "db-venues";
  /** Rutas exactas `/<source_slug>` de las filas válidas leídas por `list()`. Vacío antes de `list()`. */
  allowedPaths(): ReadonlySet<string>;
  /** Filas omitidas en la última `list()`, para que el llamador las registre como `url_rejected`. */
  rejectedRows(): readonly RejectedVenueRow[];
  /** Verificaciones derivadas de `reportPages`: 200 => active, 404 => not_found; otros fallos no generan check. */
  pendingChecks(): readonly PendingVenueCheck[];
}

/** URL canónica de la página de venue; `undefined` si el slug no cumple el patrón. Pura. */
export function buildPuntoticketVenueUrl(sourceSlug: string): string | undefined {
  if (typeof sourceSlug !== "string" || !SLUG_PATTERN.test(sourceSlug)) return undefined;
  const url = `${BASE}${sourceSlug}`;
  try {
    return canonicalSourceUrl(url, "venue_url") === url ? url : undefined;
  } catch {
    return undefined;
  }
}

function canonicalOrUndefined(value: unknown): string | undefined {
  try {
    return canonicalSourceUrl(value, "venue_url");
  } catch {
    return undefined;
  }
}

const ORDER: Record<VenueSourceState, number> = { active: 0, candidate: 1, not_found: 2 };

/**
 * Índice `db-venues`: URLs de venues desde `venue_sources` (loader inyectable).
 * Incluye `candidate` y `active`; `not_found` solo si nunca se verificó o ya pasaron
 * `notFoundRetryDays`. Orden: active, candidate, not_found vencidas (estable por grupo).
 * Filas con `source_url` distinta de `https://www.puntoticket.com/<source_slug>` se omiten.
 * Si el loader falla, `list()` lanza (el orquestador registra `venue_index_failed`).
 */
export function createDbVenuesIndex(loader: VenueSourcesLoader, options: DbVenuesOptions = {}): DbVenuesIndex {
  const now = options.now ?? (() => new Date());
  const retryMs = (options.notFoundRetryDays ?? DEFAULT_NOT_FOUND_RETRY_DAYS) * DAY_MS;
  let paths: ReadonlySet<string> = new Set();
  let rejected: RejectedVenueRow[] = [];
  let slugByUrl = new Map<string, string>();
  let checks: PendingVenueCheck[] = [];

  function due(row: VenueSourceRow): boolean {
    const state = row.status ?? "candidate";
    if (state !== "not_found") return true;
    if (!row.last_checked_at) return true;
    const checked = Date.parse(row.last_checked_at);
    return Number.isNaN(checked) || now().getTime() - checked >= retryMs;
  }

  return {
    kind: "db-venues",
    async list() {
      const rows = await loader(SOURCE);
      const accepted: Array<{ url: string; state: VenueSourceState; slug: string }> = [];
      const nextPaths = new Set<string>();
      const nextRejected: RejectedVenueRow[] = [];
      for (const row of rows) {
        const expected = buildPuntoticketVenueUrl(row?.source_slug);
        if (!expected || canonicalOrUndefined(row.source_url) !== expected) {
          nextRejected.push({
            code: "url_rejected",
            stage: "listing",
            source_slug: String(row?.source_slug),
            source_url: String(row?.source_url),
            message: "Fila de venue_sources con source_url inconsistente con source_slug."
          });
          continue;
        }
        if (!due(row)) continue;
        if (nextPaths.has(`/${row.source_slug}`)) continue;
        nextPaths.add(`/${row.source_slug}`);
        accepted.push({ url: expected, state: row.status ?? "candidate", slug: row.source_slug });
      }
      const sorted = accepted
        .map((item, index) => ({ item, index }))
        .sort((a, b) => ORDER[a.item.state] - ORDER[b.item.state] || a.index - b.index)
        .map(({ item }) => item);
      paths = nextPaths;
      rejected = nextRejected;
      slugByUrl = new Map(sorted.map((item) => [item.url, item.slug]));
      checks = [];
      return sorted.map((item) => item.url);
    },
    allowedPaths: () => paths,
    rejectedRows: () => rejected,
    rejections: () => rejected.map((r) => ({ code: r.code, source_url: r.source_url, message: r.message })),
    reportPages(results: SecondaryPageResult[]) {
      const next: PendingVenueCheck[] = [];
      for (const result of results) {
        const slug = slugByUrl.get(result.url);
        if (!slug) continue;
        if (result.ok) next.push({ source_slug: slug, status: "active" });
        else if (result.status === 404) next.push({ source_slug: slug, status: "not_found" });
      }
      checks = next;
    },
    pendingChecks: () => checks
  };
}
