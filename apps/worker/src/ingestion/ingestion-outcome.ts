import {
  CYCLE_METRICS,
  classifyRetry,
  cycleMetricSamples,
  nextEventScopeStatus,
  type CycleMetricSample,
  type Logger,
  type MetricsRegistry,
} from '@actionpop/core';

import type { IngestionJobContext } from './calendar-ingestion-processor.js';

interface LedgerWriter {
  transition(
    jobId: string,
    patch: { status: string; attempts?: number; error?: string },
  ): Promise<void>;
}

interface CycleMetricWriter {
  increment(periodToken: string, samples: readonly CycleMetricSample[]): Promise<void>;
}

/** Everything a failure path needs, whichever kind produced it. */
export interface FailureDependencies {
  readonly ledger: LedgerWriter;
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
}

interface GroupOutcomeDependencies extends FailureDependencies {
  readonly groups: {
    markStoppedUnknown(scopeId: string, reason: string, at: Date): Promise<boolean>;
  };
  readonly cycleMetrics: CycleMetricWriter;
}

interface EventOutcomeDependencies extends FailureDependencies {
  readonly scopes: { retireUnknownEvent(scopeId: string, at: Date): Promise<boolean> };
  readonly cycleMetrics: CycleMetricWriter;
}

/**
 * A definitive unknown-group answer: the scope stops being retrieved, the job
 * completes without retrying, and nothing already published is deleted.
 */
export async function stopIngestionForUnknownGroup(
  job: IngestionJobContext,
  deps: GroupOutcomeDependencies,
): Promise<void> {
  await deps.groups.markStoppedUnknown(job.scopeId, 'upstream_unknown_group', new Date());
  await deps.ledger.transition(job.jobId, {
    status: 'stopped',
    attempts: job.attemptsMade + 1,
    error: `unknown group ${job.scopeId}`,
  });
  deps.metrics.increment('actionpop_groups_unknown_total', {});
  await deps.cycleMetrics.increment(
    job.periodToken,
    cycleMetricSamples({ [CYCLE_METRICS.stoppedUnknown]: 1 }),
  );
  deps.logger.warn('ingestion stopped', {
    jobId: job.jobId,
    scopeId: job.scopeId,
    operation: 'ingestion',
    outcome: 'stopped',
    reason: 'upstream_unknown_group',
  });
}

/**
 * A definitive unknown-event answer: the event ingestion retires, the job completes
 * without retrying, and the published event keeps its content and history.
 */
export async function stopEventIngestion(
  job: { jobId: string; scopeId: string; periodToken: string; attemptsMade: number },
  deps: EventOutcomeDependencies,
): Promise<void> {
  const decision = nextEventScopeStatus(
    {
      retrievalStatus: 'active',
      eventEndsAt: null,
      statesGroup: false,
      unknownAnswer: true,
    },
    new Date(),
  );
  // Only the pure rule decides whether this answer retires the scope.
  const retired =
    decision.type === 'retire' && (await deps.scopes.retireUnknownEvent(job.scopeId, new Date()));
  await deps.ledger.transition(job.jobId, {
    status: 'stopped',
    attempts: job.attemptsMade + 1,
    error: `unknown event ${job.scopeId}`,
  });
  if (retired) {
    deps.metrics.increment('actionpop_event_ingestions_retired_total', {});
    await deps.cycleMetrics.increment(
      job.periodToken,
      cycleMetricSamples({ [CYCLE_METRICS.eventScopesRetired]: 1 }),
    );
  }
  deps.logger.warn('event ingestion retired', {
    jobId: job.jobId,
    scopeId: job.scopeId,
    operation: 'event-ingestion',
    outcome: 'retired',
    reason: decision.type === 'retire' ? decision.reason : 'not_retired',
  });
}

/** Any other failure keeps the scope status untouched and follows the retry policy. */
export async function failIngestion(
  job: IngestionJobContext,
  deps: FailureDependencies,
  error: unknown,
  startedAt: number,
): Promise<never> {
  const retryDecision = classifyRetry(error);
  const attempts = job.attemptsMade + 1;
  const retryable = retryDecision.retryable && attempts < job.maxAttempts;

  await deps.ledger.transition(job.jobId, {
    status: retryable ? 'retrying' : 'failed',
    attempts,
    error: error instanceof Error ? error.message : 'ingestion failed',
  });
  deps.metrics.increment('actionpop_jobs_failed_total', {
    outcome: 'failure',
    reason: retryDecision.reason,
  });
  deps.metrics.increment(
    'actionpop_job_duration_seconds',
    { outcome: 'failure' },
    (Date.now() - startedAt) / 1000,
  );
  if (retryDecision.retryable) {
    deps.metrics.increment('actionpop_upstream_failures_total', {
      reason: retryDecision.reason,
    });
  }
  deps.metrics.increment(
    retryable ? 'actionpop_jobs_retried_total' : 'actionpop_jobs_exhausted_total',
    { reason: retryDecision.reason },
  );
  deps.logger.error('ingestion failed', {
    jobId: job.jobId,
    scopeId: job.scopeId,
    operation: 'ingestion',
    outcome: 'failure',
    durationMs: Date.now() - startedAt,
    failure: error instanceof Error ? error.message : 'ingestion failed',
  });

  throw error;
}
