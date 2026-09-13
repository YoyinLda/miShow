import type { NormalizedEvent } from "@mishow/domain";
import {
  mapEventForPersistence as coreMapEventForPersistence,
  mapScrapeError,
  mapStartRun as coreMapStartRun,
  normalizeSnapshotName,
  sanitizePersistenceMessage,
  type PersistedEventPayload,
  type ScrapeErrorInput,
  type StartRunInput
} from "@mishow/scraper-core";
import { puntoticketAdapter } from "../adapter.js";

export { mapScrapeError, normalizeSnapshotName, sanitizePersistenceMessage, type PersistedEventPayload, type ScrapeErrorInput, type StartRunInput };

export function mapEventForPersistence(event: NormalizedEvent): PersistedEventPayload {
  return coreMapEventForPersistence(puntoticketAdapter, event);
}

export function mapStartRun(input: StartRunInput): StartRunInput {
  return coreMapStartRun(puntoticketAdapter, input);
}
