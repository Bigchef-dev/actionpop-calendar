import { describe, expect, it } from 'vitest';

import {
  EventIdentityMismatchError,
  HttpError,
  MetricsRegistry,
  TimeoutError,
  UnknownEventError,
  type EventTypeReader,
  type GeographicReferenceReader,
} from '@actionpop/core';

import { processEventIngestion } from '../src/ingestion/event-ingestion-processor.js';

interface Recorded {
  statuses: string[];
  retired: { scopeId: string; reason: string }[];
  counters: { metric: string; value: number }[];
  published: number;
}

function dependencies(error: Error | undefined, recorded: Recorded) {
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
    startTime: '2026-10-30T10:00:00+01:00',
    endTime: '2026-10-30T12:00:00+01:00',
    timezone: 'Europe/Paris',
    location: { name: 'Place' },
    groups: [],
  };

  return {
    client: {
      fetchEventDetails: async () => {
        if (error !== undefined) throw error;
        return event;
      },
    },
    ledger: {
      transition: async (_jobId: string, patch: { status: string }) => {
        recorded.statuses.push(patch.status);
      },
    },
    eventTypes,
    geographicReference,
    revisions: {
      publish: async () => ({
        snapshot: { scopeId: 'event-1', revision: 1, generatedAt: '2026-10-29T10:00:00.000Z' },
        events: [],
      }),
    },
    publisher: {
      publish: async () => {
        recorded.published += 1;
        return {
          events: 1,
          eventsWithoutGroup: 1,
          attributionsAdded: 0,
          attributionsRemoved: 0,
          discoveredUnlisted: 0,
          reEnabled: 0,
          blankIdentifiers: 0,
          eventScopesCreated: 0,
          eventScopesRetired: 0,
        };
      },
    },
    scopes: {
      retireUnknownEvent: async (scopeId: string) => {
        recorded.retired.push({ scopeId, reason: 'event_unknown' });
        return true;
      },
    },
    metrics: new MetricsRegistry(),
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    cycleMetrics: {
      increment: async (_periodToken: string, samples: { metric: string; value: number }[]) => {
        recorded.counters.push(...samples);
      },
    },
  } as never;
}

const job = {
  jobId: 'job-1',
  scopeId: 'event-1',
  periodToken: '2026-10-29T10:00:00.000Z',
  attemptsMade: 0,
  maxAttempts: 3,
};

function recorded(): Recorded {
  return { statuses: [], retired: [], counters: [], published: 0 };
}

describe('event ingestion', () => {
  it('reads, publishes and acknowledges in order', async () => {
    const state = recorded();

    await processEventIngestion(job, dependencies(undefined, state));

    expect(state.statuses).toEqual(['running', 'publishing', 'succeeded']);
    expect(state.published).toBe(1);
    expect(state.retired).toEqual([]);
  });

  it('retires the ingestion on a definitive unknown event without throwing', async () => {
    const state = recorded();

    await expect(
      processEventIngestion(job, dependencies(new UnknownEventError('event-1'), state)),
    ).resolves.toBeUndefined();

    expect(state.retired).toEqual([{ scopeId: 'event-1', reason: 'event_unknown' }]);
    expect(state.statuses).toEqual(['running', 'stopped']);
    expect(state.published).toBe(0);
  });

  it('keeps the ingestion active on a transient failure', async () => {
    const state = recorded();

    await expect(
      processEventIngestion(job, dependencies(new TimeoutError('timed out'), state)),
    ).rejects.toThrow(/timed out/);

    expect(state.retired).toEqual([]);
    expect(state.statuses).toEqual(['running', 'retrying']);
    expect(state.counters).toContainEqual({ metric: 'event_scopes.reading_failed', value: 1 });
  });

  it('keeps the ingestion active on a server error or a throttle', async () => {
    for (const error of [new HttpError(503), new HttpError(429)]) {
      const state = recorded();
      await expect(processEventIngestion(job, dependencies(error, state))).rejects.toThrow();
      expect(state.retired).toEqual([]);
      expect(state.published).toBe(0);
    }
  });

  it('retries a document describing another event instead of publishing it', async () => {
    const state = recorded();

    await expect(
      processEventIngestion(
        job,
        dependencies(new EventIdentityMismatchError('event-1', 'event-2'), state),
      ),
    ).rejects.toThrow(/event-1/);

    expect(state.statuses).toEqual(['running', 'retrying']);
    expect(state.published).toBe(0);
    expect(state.retired).toEqual([]);
  });
});
