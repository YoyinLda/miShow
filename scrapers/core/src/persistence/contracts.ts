import type { NormalizedEvent } from "@mishow/domain";

export type ScrapeRunStatus = "running" | "succeeded" | "partial" | "failed";
export type PersistenceSeverity = "warning" | "error";

export interface StartRunInput {
  source: string;
  listing_url: string;
  started_at: string;
  parameters: Record<string, unknown>;
}

export interface ScrapeRun {
  run_id: string;
  status: "running";
}

export interface PersistenceWarning {
  stage: "persist";
  source_url: string;
  code: "duplicate_source_code" | "possible_performance_date_correction";
  message: string;
  attempts: 1;
  severity: "warning";
}

export interface PersistEventResult {
  event_id: string;
  warnings: PersistenceWarning[];
}

export interface ScrapeErrorInput {
  source_url?: string;
  stage: string;
  severity: PersistenceSeverity;
  code: string;
  message: string;
  attempts: number;
}

export interface FinishRunInput {
  finished_at: string;
  status: Exclude<ScrapeRunStatus, "running">;
  discovered_count: number;
  attempted_count: number;
  succeeded_count: number;
  failed_count: number;
  warnings_count: number;
  snapshot_complete: false;
}

export interface EventPersistence {
  startRun(input: StartRunInput): Promise<ScrapeRun>;
  persistEvent(runId: string, event: NormalizedEvent): Promise<PersistEventResult>;
  recordError(runId: string, error: ScrapeErrorInput): Promise<void>;
  finishRun(runId: string, result: FinishRunInput): Promise<void>;
}

export class PersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}
