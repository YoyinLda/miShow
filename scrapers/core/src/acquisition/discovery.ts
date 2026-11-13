import { canonicalSourceUrl } from "@mishow/domain";
import type { RawEventReference } from "@mishow/domain";
import type { SourceAdapter } from "../adapter.js";

export type DiscoveryOrigin = "musica" | "venue";

export interface DiscoveryOptions {
  /** Default false. */
  enabled: boolean;
  /** Páginas secundarias solicitadas (ver `resolveDiscoveryLimits`). */
  maxPages: number;
  /** Tope duro; el efectivo es `min(maxPages, maxPagesLimit)` (Req 5.8, 13.4). */
  maxPagesLimit: number;
}

export interface DiscoveryLimits {
  maxPages: number;
  maxPagesLimit: number;
}

function limitInteger(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim();
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} debe ser un entero no negativo (recibido "${value}").`);
  }
  return Number(value);
}

/**
 * Resuelve los topes de páginas de venue desde el entorno.
 * `PUNTOTICKET_MAX_VENUE_PAGES` (default `maxEvents`) y
 * `PUNTOTICKET_MAX_VENUE_PAGES_LIMIT` (default `maxEventsLimit`).
 */
export function resolveDiscoveryLimits(
  env: Record<string, string | undefined>,
  defaults: { maxEvents: number; maxEventsLimit: number }
): DiscoveryLimits {
  const maxPages = limitInteger(env, "PUNTOTICKET_MAX_VENUE_PAGES", defaults.maxEvents);
  const maxPagesLimit = limitInteger(env, "PUNTOTICKET_MAX_VENUE_PAGES_LIMIT", defaults.maxEventsLimit);
  if (maxPages > maxPagesLimit) {
    throw new Error(
      `PUNTOTICKET_MAX_VENUE_PAGES (${maxPages}) no puede superar PUNTOTICKET_MAX_VENUE_PAGES_LIMIT (${maxPagesLimit}).`
    );
  }
  return { maxPages, maxPagesLimit };
}

export interface MergedReference {
  /** `source_url` canónica. */
  reference: RawEventReference;
  /** Orden: "musica" antes que "venue". */
  origins: DiscoveryOrigin[];
  /** URLs de páginas de venue donde apareció (solo informe). */
  venue_pages: string[];
}

export interface VenuePagesSummary {
  requested: number;
  succeeded: number;
  failed: number;
}

export interface DiscoveryReport {
  musica_unique: number;
  venue_unique: number;
  both: number;
  missing_count: number;
  total_unique: number;
  missing: string[];
  venue_pages: VenuePagesSummary;
}

/** Clave canónica de una referencia; `undefined` si la URL no es canonicalizable. */
export function canonicalKey(adapter: SourceAdapter, url: string): string | undefined {
  try {
    return canonicalSourceUrl(url, "source_url", { host: adapter.host, purchasePathPatterns: adapter.purchasePathPatterns });
  } catch {
    return undefined;
  }
}

/**
 * Une referencias de `/musica` y de páginas de venue sin duplicados.
 * Orden: `/musica` primero (orden original), luego exclusivas de venue (orden de páginas y aparición).
 */
export function mergeReferences(
  adapter: SourceAdapter,
  musica: RawEventReference[],
  venue: Array<{ page: string; refs: RawEventReference[] }>
): MergedReference[] {
  const byKey = new Map<string, MergedReference>();

  const add = (ref: RawEventReference, origin: DiscoveryOrigin, page?: string): void => {
    const key = canonicalKey(adapter, ref.source_url);
    if (key === undefined) return;
    let entry = byKey.get(key);
    if (!entry) {
      const reference: RawEventReference = { source_url: key };
      if (ref.title) reference.title = ref.title;
      entry = { reference, origins: [], venue_pages: [] };
      byKey.set(key, entry);
    } else if (!entry.reference.title && ref.title) {
      entry.reference.title = ref.title;
    }
    if (!entry.origins.includes(origin)) entry.origins.push(origin);
    if (page !== undefined && !entry.venue_pages.includes(page)) entry.venue_pages.push(page);
  };

  for (const ref of musica) add(ref, "musica");
  for (const { page, refs } of venue) for (const ref of refs) add(ref, "venue", page);

  return [...byKey.values()];
}

export function buildDiscoveryReport(merged: MergedReference[], pages: VenuePagesSummary): DiscoveryReport {
  let musica = 0;
  let venue = 0;
  let both = 0;
  const missing: string[] = [];
  for (const item of merged) {
    const inMusica = item.origins.includes("musica");
    const inVenue = item.origins.includes("venue");
    if (inMusica) musica += 1;
    if (inVenue) venue += 1;
    if (inMusica && inVenue) both += 1;
    if (inVenue && !inMusica) missing.push(item.reference.source_url);
  }
  return {
    musica_unique: musica,
    venue_unique: venue,
    both,
    missing_count: missing.length,
    total_unique: merged.length,
    missing,
    venue_pages: { ...pages }
  };
}

/** JSON estable: lista de objetos con claves `source_url` y, si existe, `title`. */
export function serializeReferences(refs: RawEventReference[]): string {
  return JSON.stringify(refs.map((ref) => (ref.title === undefined ? { source_url: ref.source_url } : { source_url: ref.source_url, title: ref.title })));
}

export function deserializeReferences(text: string): RawEventReference[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Referencias serializadas con JSON inválido.");
  }
  if (!Array.isArray(parsed)) throw new Error("Referencias serializadas deben ser una lista.");
  return parsed.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error(`Referencia ${index} mal formada.`);
    const { source_url, title } = item as Record<string, unknown>;
    if (typeof source_url !== "string" || source_url === "") throw new Error(`Referencia ${index}: source_url inválida.`);
    if (title !== undefined && typeof title !== "string") throw new Error(`Referencia ${index}: title inválido.`);
    return title === undefined ? { source_url } : { source_url, title };
  });
}
