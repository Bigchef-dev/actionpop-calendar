import {
  UnknownGroupError,
  type ActionPopulaireEventPayload,
  type EventTypeReader,
  type GeographicReferenceReader,
  type CycleMetricSample,
  type IncomingEvent,
  type IngestionLedgerStatus,
  type Logger,
  type MetricsRegistry,
  type PublicationSummary,
  type PublishedEvent,
  type PublishedGroupSnapshot,
} from '@actionpop/core';

import { collectEventPages } from './event-pages.js';
import { prepareIncomingEvent } from './event-preparation.js';
import { countPublication, publishObservation } from './publication.js';
import { failIngestion, stopIngestionForUnknownGroup } from './ingestion-outcome.js';

export interface IngestionJobContext {
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

export interface CalendarIngestionDependencies {
  readonly client: {
    fetchEventPage(
      groupId: string,
      page: number,
      pageSize: number,
    ): Promise<ActionPopulaireEventPayload[]>;
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
    markEventCancelled?: (sourceEventId: string) => Promise<boolean>;
  };
  readonly groups: {
    markStoppedUnknown(scopeId: string, reason: string, at: Date): Promise<boolean>;
  };
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
  readonly cycleMetrics: {
    increment(periodToken: string, samples: readonly CycleMetricSample[]): Promise<void>;
  };
}

export { EventTypeValidationError } from './event-preparation.js';

function summarizeGeography(events: IncomingEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const status = event.geography?.geographicStatus ?? 'unavailable';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

/**
 * Retrieves one group listing, enriches it, and publishes it as a complete
 * observation. A definitive unknown-group answer stops the scope instead of
 * failing the job; every other failure keeps the group untouched and is retried.
 */
export async function processCalendarIngestion(
  job: IngestionJobContext,
  deps: CalendarIngestionDependencies,
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
    const events = await collectEventPages((page, pageSize) =>
      deps.client.fetchEventPage(job.scopeId, page, pageSize),
    );

    const enriched: IncomingEvent[] = [];
    for (const event of events) {
      enriched.push(await prepareIncomingEvent(event, deps));
    }

    await deps.ledger.transition(job.jobId, { status: 'publishing', attempts });
    const summary = await publishObservation(job.scopeId, 'group', enriched, job.periodToken, deps);
    await deps.ledger.transition(job.jobId, { status: 'succeeded', attempts });

    countPublication(deps.metrics, summary);
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
    deps.logger.info('ingestion completed', {
      jobId: job.jobId,
      scopeId: job.scopeId,
      operation: 'ingestion',
      outcome: 'success',
      durationMs: Date.now() - startedAt,
      geography: summarizeGeography(enriched),
      attribution: {
        events: summary.events,
        eventsWithoutGroup: summary.eventsWithoutGroup,
        attributionsAdded: summary.attributionsAdded,
        attributionsRemoved: summary.attributionsRemoved,
        unlistedDiscovered: summary.discoveredUnlisted,
      },
    });
  } catch (error) {
    if (error instanceof UnknownGroupError) {
      await stopIngestionForUnknownGroup(job, deps);
      return;
    }
    await failIngestion(job, deps, error, startedAt);
  }
}
