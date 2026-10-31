import { failIngestion } from './ingestion-outcome.js';
import {
  emitMapDiscoveryMetrics,
  logMapDiscovery,
  mapDiscoveryCounters,
  mapDiscoveryCycleSamples,
  requestFor,
} from './map-discovery-reporting.js';
import type { MapDiscoveryDependencies, MapDiscoveryJobContext } from './map-discovery-types.js';

export type { MapDiscoveryDependencies, MapDiscoveryJobContext } from './map-discovery-types.js';

/**
 * Reads the public map index once and requests only pending event scopes. It never
 * reads a detail document and never publishes: the existing event processor owns
 * both, and the existing promotion ceiling bounds how many detail reads happen.
 */
export async function processMapDiscovery(
  job: MapDiscoveryJobContext,
  deps: MapDiscoveryDependencies,
): Promise<void> {
  const startedAt = Date.now();
  const attempts = job.attemptsMade + 1;

  if (!(await deps.isEnabled())) {
    await deps.ledger.transition(job.jobId, {
      scopeId: job.scopeId,
      periodToken: job.periodToken,
      status: 'stopped',
      attempts,
      error: 'map discovery disabled',
    });
    deps.logger.warn('map discovery skipped', {
      jobId: job.jobId,
      scopeId: job.scopeId,
      operation: 'map-discovery',
      outcome: 'stopped',
      reason: 'feature_disabled',
    });
    return;
  }

  await deps.ledger.transition(job.jobId, {
    scopeId: job.scopeId,
    periodToken: job.periodToken,
    status: 'running',
    attempts,
  });

  try {
    const validation = await deps.client.fetchMapEventListing();
    const now = deps.now?.() ?? new Date();
    const recorded = await deps.mapDiscovery.recordListing(validation.summaries, now);
    const candidateIds = await deps.mapDiscovery.selectGapCandidates(validation.summaries, {
      now,
      freshnessHorizonMs: deps.freshnessHorizonMs,
    });
    const selected = new Set(candidateIds);
    const requests = validation.summaries
      .filter((summary) => selected.has(summary.id))
      .map(requestFor);
    const requested =
      requests.length === 0
        ? { created: [], reopened: [] }
        : await deps.mapDiscovery.requestEventScopes(requests, now);

    if (requests.length > 0) {
      const nextReconcileAt = new Date(now.getTime() + deps.reconciliationIntervalMs);
      await deps.mapDiscovery.markRequested(
        requests.map((request) => request.eventId),
        now,
        nextReconcileAt,
      );
    }

    const counters = mapDiscoveryCounters(validation, candidateIds.length, requests.length);
    emitMapDiscoveryMetrics(deps.metrics, counters);
    deps.metrics.increment('actionpop_jobs_completed_total', { outcome: 'success' });
    deps.metrics.increment(
      'actionpop_job_duration_seconds',
      { outcome: 'success' },
      (Date.now() - startedAt) / 1000,
    );
    deps.metrics.setGauge(
      'actionpop_ingestion_last_success_timestamp',
      {},
      Math.floor(Date.now() / 1000),
    );
    await deps.cycleMetrics.increment(job.periodToken, mapDiscoveryCycleSamples(counters));

    await deps.ledger.transition(job.jobId, { status: 'succeeded', attempts });
    logMapDiscovery(deps.logger, {
      jobId: job.jobId,
      scopeId: job.scopeId,
      durationMs: Date.now() - startedAt,
      counters,
      created: requested.created.length,
      reopened: requested.reopened.length,
      inserted: recorded.inserted,
      changed: recorded.changed,
    });
  } catch (error) {
    await failIngestion(job, deps, error, startedAt);
  }
}
