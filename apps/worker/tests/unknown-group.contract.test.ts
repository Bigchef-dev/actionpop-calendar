import { describe, expect, it } from 'vitest';

import {
  HttpError,
  MetricsRegistry,
  TimeoutError,
  UnknownGroupError,
  type EventTypeReader,
  type GeographicReferenceReader,
} from '@actionpop/core';

import { processCalendarIngestion } from '../src/ingestion/calendar-ingestion-processor.js';

interface Recorded {
  statuses: string[];
  stopped: string[];
  counters: { metric: string; value: number }[];
}

function dependencies(error: Error, recorded: Recorded) {
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
      fetchEventPage: async () => {
        throw error;
      },
    },
    ledger: {
      transition: async (_jobId: string, patch: { status: string }) => {
        recorded.statuses.push(patch.status);
      },
    },
    eventTypes,
    geographicReference,
    revisions: { publish: async () => ({ snapshot: { scopeId: '', revision: 1, generatedAt: '' }, events: [] }) },
    publisher: { publish: async () => undefined },
    groups: {
      markStoppedUnknown: async (scopeId: string) => {
        recorded.stopped.push(scopeId);
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
  scopeId: 'group-1',
  periodToken: '2026-10-29T10:00:00.000Z',
  attemptsMade: 0,
  maxAttempts: 3,
};

describe('unknown group handling', () => {
  it('stops the scope without throwing or retrying', async () => {
    const recorded: Recorded = { statuses: [], stopped: [], counters: [] };

    await expect(
      processCalendarIngestion(job, dependencies(new UnknownGroupError('group-1'), recorded)),
    ).resolves.toBeUndefined();

    expect(recorded.stopped).toEqual(['group-1']);
    expect(recorded.statuses).toEqual(['running', 'stopped']);
    expect(recorded.counters).toEqual([{ metric: 'groups.stopped_unknown', value: 1 }]);
  });

  it('never stops a group on a timeout', async () => {
    const recorded: Recorded = { statuses: [], stopped: [], counters: [] };

    await expect(
      processCalendarIngestion(job, dependencies(new TimeoutError('timed out'), recorded)),
    ).rejects.toThrow(/timed out/);

    expect(recorded.stopped).toEqual([]);
    expect(recorded.statuses).toEqual(['running', 'retrying']);
  });

  it('never stops a group on a server error', async () => {
    const recorded: Recorded = { statuses: [], stopped: [], counters: [] };

    await expect(
      processCalendarIngestion(job, dependencies(new HttpError(503), recorded)),
    ).rejects.toThrow(/503/);

    expect(recorded.stopped).toEqual([]);
    expect(recorded.statuses).toEqual(['running', 'retrying']);
  });

  it('marks a non-retryable failure as failed without stopping the group', async () => {
    const recorded: Recorded = { statuses: [], stopped: [], counters: [] };

    await expect(
      processCalendarIngestion(job, dependencies(new HttpError(403), recorded)),
    ).rejects.toThrow(/403/);

    expect(recorded.stopped).toEqual([]);
    expect(recorded.statuses).toEqual(['running', 'failed']);
  });
});
