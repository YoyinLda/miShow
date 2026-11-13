import type { ExtractionResult, RawEventDetail, RawEventReference } from "@mishow/domain";
import type { ExtractedDetail } from "./extraction/detail.js";

export type AcquisitionStage = "listing" | "detail";

export interface AcquisitionUrlContext {
  discoveredDetailUrl?: string;
  /** Marca solicitudes de descubrimiento secundario (páginas de venue). */
  secondaryListing?: boolean;
}

export interface SecondaryIndexContext {
  /** Pasa por el HttpClient con contexto secundario. */
  getHtml(url: string): Promise<string>;
}

export interface SecondaryIndexSource {
  /** "fixed-list" | "sitemap" | "index-page" | "derived-from-details" */
  readonly kind: string;
  /** URLs absolutas candidatas. */
  list(ctx: SecondaryIndexContext): Promise<string[]>;
  /** Opcional: entradas del índice omitidas en la última `list()`; el orquestador las registra como errores. */
  rejections?(): readonly SecondaryIndexRejection[];
  /** Opcional: el orquestador informa el resultado de cada página solicitada. */
  reportPages?(results: SecondaryPageResult[]): void;
}

/** Resultado de solicitar una página secundaria; `status` solo en fallos HTTP. */
export interface SecondaryPageResult {
  url: string;
  ok: boolean;
  status?: number;
}

/** Resultado de solicitar una página secundaria; `status` solo en fallos HTTP. */
export interface SecondaryPageResult {
  url: string;
  ok: boolean;
  status?: number;
}

export interface SecondaryIndexRejection {
  code: string;
  source_url?: string;
  message: string;
}

export interface SecondaryDiscovery {
  /** p. ej. "venues" */
  readonly id: string;
  /** ¿La ruta es una página secundaria permitida? (allowlist explícita, no heurística) */
  isSecondaryPagePath(pathname: string): boolean;
  /** Fuente del índice de páginas secundarias (enchufable). */
  readonly index: SecondaryIndexSource;
  /** Extrae referencias de evento desde el HTML de una página secundaria. */
  parsePage(html: string, pageUrl: string): RawEventReference[];
}

/**
 * Contrato que cada fuente implementa para conducir el motor genérico del core.
 *
 * El núcleo (adquisición, orquestación, normalización y persistencia) no conoce
 * hosts ni rutas concretas: los toma del adapter. `source`/`name`/`baseUrl`/`host`
 * identifican la fuente; `listingUrl` y `purchasePathPatterns` alimentan la
 * validación de URLs; los `isXPath`/`isBlockedPath` delegan la política de rutas;
 * y `parseListing`/`parseDetail` delegan la extracción propia de la fuente.
 */
export interface SourceAdapter {
  readonly source: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly host: string;
  readonly listingUrl: string;
  readonly purchasePathPatterns: RegExp[];
  /** Descubrimiento secundario opcional (p. ej. páginas de venue). */
  readonly discovery?: SecondaryDiscovery;

  /** ¿La ruta es un listado válido para esta fuente? */
  isListingPath(pathname: string): boolean;
  /** ¿La ruta es un detalle permitido? `context.discoveredDetailUrl` es el href descubierto en el listado. */
  isDetailPath(pathname: string, context: AcquisitionUrlContext): boolean;
  /** ¿La ruta está bloqueada para adquisición en la etapa dada? */
  isBlockedPath(pathname: string, stage: AcquisitionStage): boolean;

  /** Extrae referencias de eventos desde el HTML del listado. */
  parseListing(html: string, baseUrl: string): RawEventReference[];
  /** Extrae el detalle crudo desde el HTML de un evento. */
  parseDetail(html: string, sourceUrl: string): ExtractionResult<RawEventDetail>;
  /** Normaliza el detalle crudo a la forma extraída común. */
  extractDetail(detail: RawEventDetail): ExtractionResult<ExtractedDetail>;
}
