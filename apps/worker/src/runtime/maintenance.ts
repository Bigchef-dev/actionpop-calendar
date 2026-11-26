import {
  buildIngestionJobId,
  calculateProcessingPeriod,
  countLedgerRowsForPeriod,
  countMapObservationRequests,
  countVisitedScopes,
  deleteLedgerRowsForPeriod,
  resetMapObservationRequests,
  resetVisitedScopesToPending,
  type ScopeKind,
  type VisitedScopeKind,
} from '@actionpop/core';

import type { IngestionDependencies } from '../ingestion/job-dispatch.js';
import { processMapDiscovery } from '../ingestion/map-discovery-processor.js';
import type { WorkerInfrastructure } from './infrastructure.js';
import type { ResetTarget } from './maintenance-targets.js';
import { discoverResettableJobs, removeJobsById } from './queue-maintenance.js';

export const MAP_SCOPE_ID = 'map-discovery';

export interface MapDiscoveryRunSummary {
  readonly jobId: string;
  readonly periodToken: string;
  readonly status: 'succeeded' | 'failed' | 'unknown';
  readonly error?: string;
}

/**
 * Runs one map discovery immediately, outside the periodic queue. An explicit operator
 * command bypasses `INGESTION_MAP_DISCOVERY_ENABLED` and the scope's scheduling status
 * without changing either: a disabled periodic discovery stays disabled afterwards.
 */
export async function runMapDiscoveryOnce(
  infra: WorkerInfrastructure,
  dependencies: IngestionDependencies,
  now: Date = new Date(),
): Promise<MapDiscoveryRunSummary> {
  const period = calculateProcessingPeriod(now, infra.config.queue.dispatcherIntervalMs);
  // One ledger row exists per scope and period: the manual run must reuse that identity.
  const jobId = buildIngestionJobId(MAP_SCOPE_ID, period.periodStartUtc);
  try {
    await processMapDiscovery(
      {
        jobId,
        scopeId: MAP_SCOPE_ID,
        periodToken: period.periodToken,
        attemptsMade: 0,
        // No queue owns this run, so a retry decision must not look like a scheduled retry.
        maxAttempts: 1,
      },
      { ...dependencies, isEnabled: async () => true },
    );
  } catch (error) {
    const stored = await infra.ledger.get(jobId);
    return {
      jobId,
      periodToken: period.periodToken,
      status: 'failed',
      error: stored?.error ?? (error instanceof Error ? error.message : String(error)),
    };
  }

  const stored = await infra.ledger.get(jobId);
  return {
    jobId,
    periodToken: period.periodToken,
    status: stored?.status === 'succeeded' ? 'succeeded' : 'unknown',
    ...(stored?.error === undefined ? {} : { error: stored.error }),
  };
}

export interface ResetOptions {
  readonly targets: readonly ResetTarget[];
  readonly apply?: boolean;
  readonly now?: Date;
}

export interface ResetSummary {
  readonly periodToken: string;
  readonly periodStartUtc: string;
  readonly targets: readonly ResetTarget[];
  readonly applied: boolean;
  readonly scopesToPending: number;
  readonly ledgerRows: number;
  readonly queuedJobs: number;
  readonly activeJobs: number;
  readonly observations: number;
  readonly removedJobs: number;
  readonly failedRemovals: number;
}

function scopeKinds(targets: readonly ResetTarget[]): VisitedScopeKind[] {
  return targets.flatMap((target) =>
    target === 'groups' ? ['group' as const] : target === 'events' ? ['event' as const] : [],
  );
}

function ledgerKinds(targets: readonly ResetTarget[]): ScopeKind[] {
  return [...scopeKinds(targets), ...(targets.includes('map') ? ['map' as const] : [])];
}

function includesMap(targets: readonly ResetTarget[]): boolean {
  return targets.includes('map');
}

/** Computes what a reset would clear without writing anything. */
export async function previewReset(
  infra: WorkerInfrastructure,
  options: ResetOptions,
): Promise<ResetSummary> {
  const period = calculateProcessingPeriod(
    options.now ?? new Date(),
    infra.config.queue.dispatcherIntervalMs,
  );
  const periodStartUtc = period.periodStartUtc.toISOString();
  const queued = await discoverResettableJobs(infra.queue, options.targets, periodStartUtc);
  return {
    periodToken: period.periodToken,
    periodStartUtc,
    targets: options.targets,
    applied: false,
    scopesToPending: await countVisitedScopes(infra.postgres, scopeKinds(options.targets)),
    ledgerRows: await countLedgerRowsForPeriod(
      infra.postgres,
      periodStartUtc,
      ledgerKinds(options.targets),
    ),
    queuedJobs: queued.removable.length,
    activeJobs: queued.active.length,
    observations: includesMap(options.targets)
      ? await countMapObservationRequests(infra.postgres)
      : 0,
    removedJobs: 0,
    failedRemovals: 0,
  };
}

/**
 * Applies the reset: the period's ledger rows and queue jobs are cleared so the
 * dispatcher can reschedule, and visited scopes return to `pending` so the existing
 * promotion budget spreads the full refresh instead of flooding the upstream at once.
 */
export async function applyReset(
  infra: WorkerInfrastructure,
  options: ResetOptions,
): Promise<ResetSummary> {
  const period = calculateProcessingPeriod(
    options.now ?? new Date(),
    infra.config.queue.dispatcherIntervalMs,
  );
  const periodStartUtc = period.periodStartUtc.toISOString();
  const queued = await discoverResettableJobs(infra.queue, options.targets, periodStartUtc);
  const ledgerJobIds = await deleteLedgerRowsForPeriod(
    infra.postgres,
    periodStartUtc,
    ledgerKinds(options.targets),
  );
  const removal = await removeJobsById(infra.queue, [...queued.removable, ...ledgerJobIds]);
  const scopesToPending = await resetVisitedScopesToPending(
    infra.postgres,
    scopeKinds(options.targets),
  );

  let observations = 0;
  if (includesMap(options.targets)) {
    await infra.registry.ensureMapScope(true);
    observations = await resetMapObservationRequests(infra.postgres);
  }

  return {
    periodToken: period.periodToken,
    periodStartUtc,
    targets: options.targets,
    applied: true,
    scopesToPending,
    ledgerRows: ledgerJobIds.length,
    queuedJobs: queued.removable.length,
    activeJobs: new Set([...queued.active, ...removal.active]).size,
    observations,
    removedJobs: removal.removed,
    failedRemovals: removal.failed,
  };
}
