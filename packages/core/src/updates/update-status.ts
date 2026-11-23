import { LEDGER_GRACE_MS } from '../config/defaults.config.js';
import type {
  CompletedRun,
  CurrentRun,
  CurrentRunCounts,
  SettledRun,
  UpdateOutcome,
  UpdateState,
  UpdateStatusAnswer,
} from '../models/update-status.js';

const PROCESSED_STATUSES = new Set(['succeeded', 'stopped']);
const FAILED_STATUSES = new Set(['failed']);
const DEFAULT_HISTORY_LIMIT = 5;

export interface CurrentRunInput {
  readonly startedAt: Date;
  readonly counts: CurrentRunCounts;
  readonly groups: CurrentRunCounts;
  readonly events: CurrentRunCounts;
  readonly completedAt: Date | null;
}

export interface BuildUpdateStatusInput {
  readonly now: Date;
  readonly intervalMs: number;
  readonly current: CurrentRunInput | null;
  readonly currentAvailable: boolean;
  /** Null when the settled-period read failed. */
  readonly settled: readonly SettledRun[] | null;
  readonly historyLimit?: number;
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** Buckets raw ledger status counts into processed, failed and remaining work. */
export function countsFromStatuses(statuses: Readonly<Record<string, number>>): CurrentRunCounts {
  let processed = 0;
  let failed = 0;
  let remaining = 0;
  for (const [status, raw] of Object.entries(statuses)) {
    const value = safeCount(raw);
    if (PROCESSED_STATUSES.has(status)) processed += value;
    else if (FAILED_STATUSES.has(status)) failed += value;
    else remaining += value;
  }
  return { processed, failed, remaining, total: processed + failed + remaining };
}

/** A run with no failure is complete; a run where every terminal target failed is failed. */
export function outcomeFor(counts: CurrentRunCounts): UpdateOutcome {
  if (counts.failed === 0) return 'complete';
  return counts.processed === 0 ? 'failed' : 'partial';
}

/** Duration never goes negative when a row is older than its period. */
export function durationSeconds(start: Date, end: Date): number {
  const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
  return seconds > 0 ? seconds : 0;
}

function completedRun(
  startedAt: Date,
  counts: CurrentRunCounts,
  groups: CurrentRunCounts,
  events: CurrentRunCounts,
  completedAt: Date,
): CompletedRun {
  return {
    completedAt: completedAt.toISOString(),
    durationSeconds: durationSeconds(startedAt, completedAt),
    processed: counts.processed,
    failed: counts.failed,
    outcome: outcomeFor(counts),
    groups,
    events,
  };
}

/** A current period is abandoned once the project's ledger grace has elapsed. */
function isAbandoned(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() >= LEDGER_GRACE_MS;
}

function currentRun(input: CurrentRunInput, now: Date, intervalMs: number): CurrentRun {
  const { counts } = input;
  return {
    startedAt: input.startedAt.toISOString(),
    processed: counts.processed,
    failed: counts.failed,
    remaining: counts.remaining,
    total: counts.total,
    groups: input.groups,
    events: input.events,
    takingLongerThanUsual:
      counts.remaining > 0 && now.getTime() - input.startedAt.getTime() >= intervalMs,
  };
}

function classify(input: BuildUpdateStatusInput, lastCompleted: CompletedRun | null): UpdateState {
  if (
    input.current !== null &&
    input.currentAvailable &&
    input.current.counts.remaining > 0 &&
    !isAbandoned(input.current.startedAt, input.now)
  ) {
    return 'updating';
  }
  if (lastCompleted === null) return 'unknown';
  if (lastCompleted.outcome !== 'complete') return 'partial';
  const age = input.now.getTime() - Date.parse(lastCompleted.completedAt);
  return age > input.intervalMs ? 'stale' : 'up_to_date';
}

/** Builds the public answer; history is bounded and always starts with `lastCompleted`. */
export function buildUpdateStatus(input: BuildUpdateStatusInput): UpdateStatusAnswer {
  const limit = input.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const completed: CompletedRun[] = [];
  const current = input.current;

  if (
    current !== null &&
    input.currentAvailable &&
    current.completedAt !== null &&
    current.counts.total > 0 &&
    current.counts.remaining === 0
  ) {
    completed.push(
      completedRun(
        current.startedAt,
        current.counts,
        current.groups,
        current.events,
        current.completedAt,
      ),
    );
  }
  if (input.settled !== null) {
    for (const run of input.settled) {
      completed.push(
        completedRun(run.periodStartUtc, run.counts, run.groups, run.events, run.completedAt),
      );
    }
  }
  completed.sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));

  const lastCompleted = completed[0] ?? null;
  const completedAvailable = input.settled !== null || lastCompleted !== null;
  return {
    checkedAt: input.now.toISOString(),
    refreshIntervalSeconds: Math.max(1, Math.round(input.intervalMs / 1000)),
    state: classify(input, lastCompleted),
    current:
      current !== null && input.currentAvailable && !isAbandoned(current.startedAt, input.now)
        ? currentRun(current, input.now, input.intervalMs)
        : null,
    lastCompleted,
    history: completed.slice(0, limit),
    available: {
      current: input.currentAvailable,
      lastCompleted: completedAvailable,
      history: completedAvailable,
    },
  };
}
