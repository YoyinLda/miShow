import {
  scrape,
  type AcquisitionConfig,
  type AcquisitionErrorStage,
  type HttpClient,
  type ScrapeError,
  type ScrapeResult
} from "@mishow/scraper-core";
import { ticketmasterAdapter } from "../adapter.js";

export type { AcquisitionErrorStage };

export type TicketmasterScrapeError = ScrapeError;
export type TicketmasterScrapeResult = ScrapeResult;

export interface TicketmasterScraperOptions {
  config?: Partial<AcquisitionConfig>;
  client: HttpClient;
  now: () => Date;
}

export async function scrapeTicketmaster(options: TicketmasterScraperOptions): Promise<TicketmasterScrapeResult> {
  return scrape({ adapter: ticketmasterAdapter, ...options });
}
