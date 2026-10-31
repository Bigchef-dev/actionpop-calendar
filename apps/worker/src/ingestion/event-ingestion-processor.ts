import {
  CYCLE_METRICS,
  cycleMetricSamples,
  EventIdentityMismatchError,
  UnknownEventError,
  type ActionPopulaireEventPayload,
  type CycleMetricSample,
  type EventTypeReader,
  type GeographicReferenceReader,
  type IncomingEvent,
  type IngestionLedgerStatus,
  type Logger,
  type MetricsRegistry,
  type PublicationSummary,
  type PublishedEvent,
  type PublishedGroupSnapshot,
} from '@actionpop/core';

import { prepareIncomingEvent } from './event-preparation.js';
import { failIngestion, stopEventIngestion } from './ingestion-outcome.js';
import { countPublication, publishObservation } from './publication.js';

export interface EventIngestionJobContext {
  readonly jobId: string;
  readonly scopeId: string;
  readonly periodToken: string;
  readonly attemptsMade: number;
  readonly maxAttempts: number;
}

interface LedgerTransition {
  scopeId?: string;
  periodToken?: string;
  status: IngestionLedgerStatus;
  attempts?: number;
  error?: string;
}

export type MapOutcome = 'resolved' | 'unknown' | 'mismatched' | 'failed';

export interface EventIngestionDependencies {
  readonly client: { fetchEventDetails(eventId: string): Promise<unknown> };
  /** Optional so group-discovered event scopes keep working without a map observation. */
  readonly mapDiscovery?: {
    recordOutcome(eventId: string, outcome: MapOutcome, at: Date): Promise<boolean>;
  };
  readonly ledger: { transition(jobId: string, patch: LedgerTransition): Promise<void> };
  readonly eventTypes: EventTypeReader;
  readonly geographicReference: GeographicReferenceReader;
  readonly revisions: {
    publish(
      scopeId: string,
      incoming: IncomingEvent[],
      complete?: boolean,
      periodToken?: string,
    ): Promise<{ snapshot: PublishedGroupSnapshot; events: PublishedEvent[] }>;
  };
  readonly publisher: {
    publish(
      scopeId: string,
      snapshot: PublishedGroupSnapshot,
      events: PublishedEvent[],
    ): Promise<PublicationSummary>;
  };
  readonly scopes: { retireUnknownEvent(scopeId: string, at: Date): Promise<boolean> };
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
  readonly cycleMetrics: {
    increment(periodToken: string, samples: readonly CycleMetricSample[]): Promise<void>;
  };
}

async function recordMapOutcome(
  deps: EventIngestionDependencies,
  eventId: string,
  outcome: MapOutcome,
): Promise<void> {
  if (deps.mapDiscovery === undefined) return;
  try {
    await deps.mapDiscovery.recordOutcome(eventId, outcome, new Date());
  } catch (error) {
    // Observability must not turn a successful publication into a failed job.
    deps.logger.warn('map outcome recording failed', {
      operation: 'map-discovery',
      eventId,
      outcome,
      failure: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

/**
 * Retrieves one event's detail resource and publishes it as a complete observation of
 * that event. The document must describe the requested event; anything else leaves the
 * ingestion scheduled, because only a definitive unknown answer may retire it.
 */
export async function processEventIngestion(
  job: EventIngestionJobContext,
  deps: EventIngestionDependencies,
): Promise<void> {
  const startedAt = Date.now();
  const attempts = job.attemptsMade + 1;
  await deps.ledger.transition(job.jobId, {
    scopeId: job.scopeId,
    periodToken: job.periodToken,
    status: 'running',
    attempts,
  });

  try {
    const payload = await deps.client.fetchEventDetails(job.scopeId);
    const incoming = await prepareIncomingEvent(payload as ActionPopulaireEventPayload, deps);

    await deps.ledger.transition(job.jobId, { status: 'publishing', attempts });
    const summary = await publishObservation(
      job.scopeId,
      'event',
      [incoming],
      job.periodToken,
      deps,
    );
    await recordMapOutcome(deps, job.scopeId, 'resolved');
    await deps.ledger.transition(job.jobId, { status: 'succeeded', attempts });

    countPublication(deps.metrics, summary);
    deps.metrics.increment('actionpop_jobs_completed_total', { outcome: 'success' });
    deps.metrics.increment(
      'actionpop_job_duration_seconds',
      { outcome: 'success' },
      (Date.now() - startedAt) / 1000,
    );
    deps.logger.info('event ingestion completed', {
      jobId: job.jobId,
      scopeId: job.scopeId,
      operation: 'event-ingestion',
      outcome: 'success',
      durationMs: Date.now() - startedAt,
      attribution: {
        events: summary.events,
        eventsWithoutGroup: summary.eventsWithoutGroup,
        attributionsAdded: summary.attributionsAdded,
        attributionsRemoved: summary.attributionsRemoved,
      },
      retired: summary.eventScopesRetired > 0,
    });
  } catch (error) {
    if (error instanceof UnknownEventError) {
      await recordMapOutcome(deps, job.scopeId, 'unknown');
      await stopEventIngestion(job, deps);
      return;
    }
    await recordMapOutcome(
      deps,
      job.scopeId,
      error instanceof EventIdentityMismatchError ? 'mismatched' : 'failed',
    );
    deps.metrics.increment('actionpop_event_readings_failed_total', {});
    await deps.cycleMetrics.increment(
      job.periodToken,
      cycleMetricSamples({ [CYCLE_METRICS.eventScopesReadingFailed]: 1 }),
    );
    await failIngestion(job, deps, error, startedAt);
  }
}
