import {
  scrape,
  type AcquisitionConfig,
  type AcquisitionErrorStage,
  type HttpClient,
  type ScrapeError,
  type ScrapeResult
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
}

export async function scrapePuntoTicket(options: PuntoticketScraperOptions): Promise<PuntoticketScrapeResult> {
  return scrape({ adapter: puntoticketAdapter, ...options });
}
