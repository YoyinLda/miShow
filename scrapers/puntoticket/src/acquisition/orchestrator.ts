import {
  scrape,
  type AcquisitionConfig,
  type AcquisitionErrorStage,
  type DiscoveryOptions,
  type HttpClient,
  type ScrapeError,
  type ScrapeResult,
  type SourceAdapter
} from "@mishow/scraper-core";
import { puntoticketAdapter } from "../adapter.js";

export type { AcquisitionErrorStage };

// Alias históricos que consumen tests, CLI y la capa de persistencia.
export type PuntoticketScrapeError = ScrapeError;
export type PuntoticketScrapeResult = ScrapeResult;

export interface PuntoticketScraperOptions {
  config?: Partial<AcquisitionConfig>;
  client: HttpClient;
  now: () => Date;
  /** Descubrimiento secundario opcional (desactivado por defecto). */
  discovery?: DiscoveryOptions;
  /** Adapter a usar; por defecto `puntoticketAdapter`. */
  adapter?: SourceAdapter;
}

export async function scrapePuntoTicket(options: PuntoticketScraperOptions): Promise<PuntoticketScrapeResult> {
  const { adapter = puntoticketAdapter, ...rest } = options;
  return scrape({ ...rest, adapter });
}
