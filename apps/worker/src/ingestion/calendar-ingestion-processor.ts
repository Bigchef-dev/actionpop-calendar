import {
  enrichEventGeography,
  UnknownGroupError,
  validateEventType,
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
import { failIngestion, stopIngestionForUnknownGroup } from './ingestion-outcome.js';
import { toIncomingEvent, toRawLocationFields } from './event-mapper.js';

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

export class EventTypeValidationError extends Error {
  public constructor(message: string) {
    super(`event type validation failed: ${message}`);
    this.name = 'EventTypeValidationError';
  }
}

function summarizeGeography(events: IncomingEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const status = event.geography?.geographicStatus ?? 'unavailable';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

/**
 * Cumulative mirror of the per-cycle counters, so the `/metrics` endpoint answers
 * "how many unlisted groups, events without a group and attribution changes so far".
 * A zero change publishes nothing, which keeps the registry readable.
 */
function countPublishedAttribution(metrics: MetricsRegistry, summary: PublicationSummary): void {
  const counters: readonly (readonly [string, number])[] = [
    ['actionpop_groups_discovered_total', summary.discoveredUnlisted],
    ['actionpop_groups_re_enabled_total', summary.reEnabled],
    ['actionpop_events_without_group_total', summary.eventsWithoutGroup],
    ['actionpop_attributions_added_total', summary.attributionsAdded],
    ['actionpop_attributions_removed_total', summary.attributionsRemoved],
  ];

  for (const [name, value] of counters) {
    if (value > 0) metrics.increment(name, {}, value);
  }
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
      const typeValidation = await validateEventType(event.subtype?.label, deps.eventTypes);
      const blocking = typeValidation.diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'error',
      );
      if (blocking.length > 0) {
        throw new EventTypeValidationError(
          blocking.map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`).join('; '),
        );
      }

      const geography = await enrichEventGeography(
        toRawLocationFields(event),
        deps.geographicReference,
      );
      enriched.push(toIncomingEvent(event, geography, typeValidation.eventType));
    }

    await deps.ledger.transition(job.jobId, { status: 'publishing', attempts });
    const publication = await deps.revisions.publish(job.scopeId, enriched, true, job.periodToken);
    const summary = await deps.publisher.publish(
      job.scopeId,
      publication.snapshot,
      publication.events,
    );
    await deps.ledger.transition(job.jobId, { status: 'succeeded', attempts });

    countPublishedAttribution(deps.metrics, summary);
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
