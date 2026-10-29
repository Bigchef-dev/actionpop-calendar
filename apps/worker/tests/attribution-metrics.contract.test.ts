import { describe, expect, it } from 'vitest';

import {
  MetricsRegistry,
  type EventTypeReader,
  type GeographicReferenceReader,
  type PublicationSummary,
} from '@actionpop/core';

import { processCalendarIngestion } from '../src/ingestion/calendar-ingestion-processor.js';

const job = {
  jobId: 'job-1',
  scopeId: 'listing-1',
  periodToken: '2026-10-29T10:00:00.000Z',
  attemptsMade: 0,
  maxAttempts: 3,
};

function summary(overrides: Partial<PublicationSummary> = {}): PublicationSummary {
  return {
    events: 10,
    eventsWithoutGroup: 0,
    attributionsAdded: 0,
    attributionsRemoved: 0,
    discoveredUnlisted: 0,
    reEnabled: 0,
    blankIdentifiers: 0,
    ...overrides,
  };
}

function dependencies(metrics: MetricsRegistry, published: PublicationSummary) {
  const eventTypes: EventTypeReader = {
    findEventType: async () => null,
    recordObservedEventTypes: async () => undefined,
  };
  const geographicReference = {
    findActiveVersion: async () => null,
    findDepartment: async () => null,
    findCommunesByNormalizedName: async () => [],
    findCommuneByPostalCode: async () => [],
  } as unknown as GeographicReferenceReader;
  const event = {
    id: 'event-1',
    name: 'Tractage',
    startTime: '2026-10-20T10:00:00+02:00',
    endTime: '2026-10-20T11:00:00+02:00',
    timezone: 'Europe/Paris',
    location: { name: 'Place' },
    groups: [],
  };

  return {
    client: { fetchEventPage: async () => [event] },
    ledger: { transition: async () => undefined },
    eventTypes,
    geographicReference,
    revisions: {
      publish: async () => ({
        snapshot: { scopeId: 'listing-1', revision: 1, generatedAt: '2026-10-29T10:00:00.000Z' },
        events: [],
      }),
    },
    publisher: { publish: async () => published },
    groups: { markStoppedUnknown: async () => true },
    metrics,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    cycleMetrics: { increment: async () => undefined },
  } as never;
}

function counters(metrics: MetricsRegistry): Record<string, number> {
  return Object.fromEntries(metrics.snapshot().map((sample) => [sample.name, sample.value]));
}

describe('cumulative attribution counters', () => {
  it('mirrors the publication summary on the metrics endpoint', async () => {
    const metrics = new MetricsRegistry();

    await processCalendarIngestion(
      job,
      dependencies(
        metrics,
        summary({
          discoveredUnlisted: 2,
          reEnabled: 1,
          eventsWithoutGroup: 3,
          attributionsAdded: 4,
          attributionsRemoved: 5,
        }),
      ),
    );

    expect(counters(metrics)).toMatchObject({
      actionpop_groups_discovered_total: 2,
      actionpop_groups_re_enabled_total: 1,
      actionpop_events_without_group_total: 3,
      actionpop_attributions_added_total: 4,
      actionpop_attributions_removed_total: 5,
    });
  });

  it('publishes no attribution counter when a cycle changes nothing', async () => {
    const metrics = new MetricsRegistry();

    await processCalendarIngestion(job, dependencies(metrics, summary()));

    const published = counters(metrics);
    expect(published.actionpop_groups_discovered_total).toBeUndefined();
    expect(published.actionpop_attributions_added_total).toBeUndefined();
    expect(published.actionpop_attributions_removed_total).toBeUndefined();
    expect(published.actionpop_events_without_group_total).toBeUndefined();
  });
});
