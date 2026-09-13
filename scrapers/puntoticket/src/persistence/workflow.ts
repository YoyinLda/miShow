import {
  executePersistedScrape,
  PersistedRunError,
  type EventPersistence,
  type PersistedScrapeResult,
  type StartRunInput
} from "@mishow/scraper-core";
import type { PuntoticketScrapeResult } from "../acquisition/orchestrator.js";

export { PersistedRunError };

export type PersistedPuntoticketScrapeResult = PersistedScrapeResult;

export async function executePersistedPuntoTicketScrape(options: {
  persistence: EventPersistence;
  start: StartRunInput;
  scrape: () => Promise<PuntoticketScrapeResult>;
  now: () => Date;
}): Promise<PersistedPuntoticketScrapeResult> {
  return executePersistedScrape(options);
}
