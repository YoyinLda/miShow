import type { ScrapeError, ScrapeResult } from "../acquisition/orchestrator.js";
import {
  PersistenceError,
  type EventPersistence,
  type FinishRunInput,
  type PersistenceWarning,
  type ScrapeErrorInput,
  type ScrapeRunStatus,
  type StartRunInput
} from "./contracts.js";
import { sanitizePersistenceMessage } from "./mapping.js";

export interface PersistedScrapeResult extends ScrapeResult {
  run_id: string;
  status: Exclude<ScrapeRunStatus, "running">;
  errors: Array<ScrapeError | PersistenceWarning>;
}

export class PersistedRunError extends Error {
  constructor(readonly runId: string, message: string, readonly finalizationError?: PersistenceError) {
    super(message, finalizationError ? { cause: finalizationError } : undefined);
    this.name = "PersistedRunError";
  }
}

export async function executePersistedScrape(options: {
  persistence: EventPersistence;
  start: StartRunInput;
  scrape: () => Promise<ScrapeResult>;
  now: () => Date;
}): Promise<PersistedScrapeResult> {
  const run = await options.persistence.startRun(options.start);
  let scraped: ScrapeResult;
  try {
    scraped = await options.scrape();
  } catch (error) {
    const message = sanitizePersistenceMessage(error instanceof Error ? error.message : error);
    await recordErrorBestEffort(options.persistence, run.run_id, {
      stage: "listing",
      severity: "error",
      code: "global_acquisition_failure",
      message,
      attempts: 1
    });
    await finishRunOrThrow(options.persistence, run.run_id, {
      finished_at: options.now().toISOString(),
      status: "failed",
      discovered_count: 0,
      attempted_count: 0,
      succeeded_count: 0,
      failed_count: 0,
      warnings_count: 0,
      snapshot_complete: false
    }, message);
    throw new PersistedRunError(run.run_id, message);
  }

  const errors: Array<ScrapeError | PersistenceWarning> = [...scraped.errors];
  let persistedCount = 0;
  let persistenceFailures = 0;
  let persistenceWarnings = 0;

  for (const error of scraped.errors) {
    await recordErrorBestEffort(options.persistence, run.run_id, {
      source_url: error.source_url,
      stage: error.stage,
      severity: error.code === "parser_warning" ? "warning" : "error",
      code: error.code,
      message: error.message,
      attempts: error.attempts
    });
  }

  for (const event of scraped.events) {
    try {
      const persisted = await options.persistence.persistEvent(run.run_id, event);
      persistedCount += 1;
      persistenceWarnings += persisted.warnings.length;
      errors.push(...persisted.warnings);
    } catch (error) {
      persistenceFailures += 1;
      const persistenceError = toPersistenceError(error);
      const outputError: ScrapeError = {
        stage: "persist",
        source_url: event.source_url,
        code: persistenceError.code,
        message: sanitizePersistenceMessage(persistenceError.message),
        attempts: 1
      };
      errors.push(outputError);
      await recordErrorBestEffort(options.persistence, run.run_id, { ...outputError, severity: "error" });
    }
  }

  const failedCount = scraped.summary.failed + persistenceFailures;
  const warningCount = scraped.errors.filter((error) => error.code === "parser_warning").length + persistenceWarnings;
  const status = runStatus(persistedCount, failedCount, warningCount);
  const finishedAt = options.now().toISOString();
  await finishRunOrThrow(options.persistence, run.run_id, {
    finished_at: finishedAt,
    status,
    discovered_count: scraped.summary.discovered,
    attempted_count: scraped.summary.attempted,
    succeeded_count: persistedCount,
    failed_count: failedCount,
    warnings_count: warningCount,
    snapshot_complete: false
  });

  return {
    ...scraped,
    finished_at: finishedAt,
    run_id: run.run_id,
    status,
    summary: { ...scraped.summary, succeeded: persistedCount, failed: failedCount },
    errors
  };
}

function runStatus(succeeded: number, failed: number, warnings: number): Exclude<ScrapeRunStatus, "running"> {
  if (succeeded === 0 && failed > 0) return "failed";
  if (failed > 0 || warnings > 0) return "partial";
  return "succeeded";
}

function toPersistenceError(error: unknown): PersistenceError {
  const persistenceError = error instanceof PersistenceError
    ? error
    : new PersistenceError("persistence_error", error instanceof Error ? error.message : "Error de persistencia.");
  return new PersistenceError(
    sanitizePersistenceMessage(persistenceError.code),
    sanitizePersistenceMessage(persistenceError.message),
    persistenceError.status
  );
}

async function finishRunOrThrow(
  persistence: EventPersistence,
  runId: string,
  result: FinishRunInput,
  primaryMessage?: string
): Promise<void> {
  try {
    await persistence.finishRun(runId, result);
  } catch (error) {
    const finalizationError = toPersistenceError(error);
    const message = primaryMessage ?? `finishRun fallo (${finalizationError.code}): ${finalizationError.message}`;
    throw new PersistedRunError(runId, message, finalizationError);
  }
}

async function recordErrorBestEffort(persistence: EventPersistence, runId: string, error: ScrapeErrorInput): Promise<void> {
  try {
    await persistence.recordError(runId, error);
  } catch {
    // The primary scrape/persistence error remains in memory; secondary recording must not block finalization.
  }
}
