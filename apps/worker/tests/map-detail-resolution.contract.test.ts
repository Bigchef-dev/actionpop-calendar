import { describe, expect, it } from 'vitest';

import {
  EventIdentityMismatchError,
  MetricsRegistry,
  TimeoutError,
  UnknownEventError,
  type EventTypeReader,
  type GeographicReferenceReader,
} from '@actionpop/core';

import {
  processEventIngestion,
  type MapOutcome,
} from '../src/ingestion/event-ingestion-processor.js';

const event = {
  id: 'event-1',
  name: 'Meeting',
  startTime: '2026-10-30T10:00:00+01:00',
  endTime: '2026-10-30T12:00:00+01:00',
  timezone: 'Europe/Paris',
  location: { name: 'Place' },
  groups: [],
};

function dependencies(error: Error | undefined, outcomes: MapOutcome[], withMap = true) {
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

  return {
    client: {
      fetchEventDetails: async () => {
        if (error !== undefined) throw error;
        return event;
      },
    },
    ...(withMap
      ? {
          mapDiscovery: {
            recordOutcome: async (_eventId: string, outcome: MapOutcome) => {
              outcomes.push(outcome);
              return true;
            },
          },
        }
      : {}),
    ledger: { transition: async () => undefined },
    eventTypes,
    geographicReference,
    revisions: {
      publish: async () => ({
        snapshot: { scopeId: 'event-1', revision: 1, generatedAt: '2026-10-30T10:00:00.000Z' },
        events: [],
      }),
    },
    publisher: {
      publish: async () => ({
        events: 1,
        eventsWithoutGroup: 1,
        attributionsAdded: 0,
        attributionsRemoved: 0,
        discoveredUnlisted: 0,
        reEnabled: 0,
        blankIdentifiers: 0,
        eventScopesCreated: 0,
        eventScopesRetired: 0,
      }),
    },
    scopes: { retireUnknownEvent: async () => true },
    metrics: new MetricsRegistry(),
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    cycleMetrics: { increment: async () => undefined },
  };
}

const job = {
  jobId: 'job-1',
  scopeId: 'event-1',
  periodToken: '2026-10-30T10:00:00.000Z',
  attemptsMade: 0,
  maxAttempts: 3,
};

describe('map detail resolution', () => {
  it('records resolved after a matching detail is published', async () => {
    const outcomes: MapOutcome[] = [];

    await processEventIngestion(job, dependencies(undefined, outcomes) as never);

    expect(outcomes).toEqual(['resolved']);
  });

  it('records unknown on a definitive unknown event', async () => {
    const outcomes: MapOutcome[] = [];

    await processEventIngestion(
      job,
      dependencies(new UnknownEventError('event-1'), outcomes) as never,
    );

    expect(outcomes).toEqual(['unknown']);
  });

  it('records mismatched on another identity and keeps the retryable classification', async () => {
    const outcomes: MapOutcome[] = [];

    await expect(
      processEventIngestion(
        job,
        dependencies(new EventIdentityMismatchError('event-1', 'event-2'), outcomes) as never,
      ),
    ).rejects.toThrow(/event-1/);

    expect(outcomes).toEqual(['mismatched']);
  });

  it('records failed for every other failure', async () => {
    const outcomes: MapOutcome[] = [];

    await expect(
      processEventIngestion(job, dependencies(new TimeoutError('timed out'), outcomes) as never),
    ).rejects.toThrow(/timed out/);

    expect(outcomes).toEqual(['failed']);
  });

  it('works without a map observation dependency', async () => {
    await expect(
      processEventIngestion(job, dependencies(undefined, [], false) as never),
    ).resolves.toBeUndefined();
  });
});
