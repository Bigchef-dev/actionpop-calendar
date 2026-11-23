/** Visitor-facing states of the periodic calendar refresh. */
export type UpdateState = 'updating' | 'up_to_date' | 'stale' | 'partial' | 'unknown';

/** Outcome of one settled refresh run. */
export type UpdateOutcome = 'complete' | 'partial' | 'failed';

/** Aggregate counts of one refresh run, already bucketed for the public answer. */
export interface CurrentRunCounts {
  readonly processed: number;
  readonly failed: number;
  readonly remaining: number;
  readonly total: number;
}

/** Per-kind figures: refreshed group scopes and events observed in the period. */
export interface UpdateKindCounts {
  readonly groups: CurrentRunCounts;
  readonly events: CurrentRunCounts;
}

/** The refresh currently inside its period, with aggregate and per-kind counts. */
export interface CurrentRun extends UpdateKindCounts {
  readonly startedAt: string;
  readonly processed: number;
  readonly failed: number;
  readonly remaining: number;
  readonly total: number;
  readonly takingLongerThanUsual: boolean;
}

/** One settled refresh run, reduced to the fields a visitor may see. */
export interface CompletedRun extends UpdateKindCounts {
  readonly completedAt: string;
  readonly durationSeconds: number;
  readonly processed: number;
  readonly failed: number;
  readonly outcome: UpdateOutcome;
}

/** Which sections of the answer were read successfully. */
export interface UpdateAvailability {
  readonly current: boolean;
  readonly lastCompleted: boolean;
  readonly history: boolean;
}

/** The public `GET /updates` payload. It can never carry an identifier or an error. */
export interface UpdateStatusAnswer {
  readonly checkedAt: string;
  readonly refreshIntervalSeconds: number;
  readonly state: UpdateState;
  readonly current: CurrentRun | null;
  readonly lastCompleted: CompletedRun | null;
  readonly history: readonly CompletedRun[];
  readonly available: UpdateAvailability;
}

/** One reading for the period in progress: ledger totals plus explicit per-kind figures. */
export interface CurrentRunReading extends UpdateKindCounts {
  readonly counts: CurrentRunCounts;
  /** Latest ledger update in the period; null when no row carries one. */
  readonly completedAt: Date | null;
}

/** One settled period aggregated from the ledger and event observations. */
export interface SettledRun extends UpdateKindCounts {
  readonly periodStartUtc: Date;
  readonly completedAt: Date;
  readonly counts: CurrentRunCounts;
}

/**
 * Read port of the public update status.
 *
 * The port deliberately cannot carry a scope, a job, a period token, a failure reason or a
 * display name: those fields belong to the operator surfaces, not to a public read.
 */
export interface UpdateStatusReader {
  current(periodStartUtc: Date): Promise<CurrentRunReading | null>;
  settled(limit: number, beforePeriodStartUtc: Date, now: Date): Promise<readonly SettledRun[]>;
}
