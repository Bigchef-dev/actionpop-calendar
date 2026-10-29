import {
  CYCLE_METRICS,
  classifyRetry,
  cycleMetricSamples,
  type CycleMetricSample,
  type Logger,
  type MetricsRegistry,
} from '@actionpop/core';

import type {
  CalendarIngestionDependencies,
  IngestionJobContext,
} from './calendar-ingestion-processor.js';

interface OutcomeDependencies {
  readonly ledger: CalendarIngestionDependencies['ledger'];
  readonly groups: CalendarIngestionDependencies['groups'];
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
  readonly cycleMetrics: {
    increment(periodToken: string, samples: readonly CycleMetricSample[]): Promise<void>;
  };
}

/**
 * A definitive unknown-group answer: the scope stops being retrieved, the job
 * completes without retrying, and nothing already published is deleted.
 */
export async function stopIngestionForUnknownGroup(
  job: IngestionJobContext,
  deps: OutcomeDependencies,
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

/** Any other failure keeps the group status untouched and follows the retry policy. */
export async function failIngestion(
  job: IngestionJobContext,
  deps: OutcomeDependencies,
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
