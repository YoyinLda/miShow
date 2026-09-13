import type { ExtractionResult, RawEventDetail, RawEventReference } from "@mishow/domain";
import type { ExtractedDetail } from "./extraction/detail.js";

export type AcquisitionStage = "listing" | "detail";

export interface AcquisitionUrlContext {
  discoveredDetailUrl?: string;
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
