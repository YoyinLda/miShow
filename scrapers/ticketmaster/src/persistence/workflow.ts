import {
  executePersistedScrape,
  PersistedRunError,
  type EventPersistence,
  type PersistedScrapeResult,
  type StartRunInput
} from "@mishow/scraper-core";
import type { TicketmasterScrapeResult } from "../acquisition/orchestrator.js";

export { PersistedRunError };

export type PersistedTicketmasterScrapeResult = PersistedScrapeResult;

export async function executePersistedTicketmasterScrape(options: {
  persistence: EventPersistence;
  start: StartRunInput;
  scrape: () => Promise<TicketmasterScrapeResult>;
  now: () => Date;
}): Promise<PersistedTicketmasterScrapeResult> {
  return executePersistedScrape(options);
}
