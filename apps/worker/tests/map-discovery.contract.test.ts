import { describe, expect, it, vi } from 'vitest';

import {
  MetricsRegistry,
  createLogger,
  type EventScopeRequest,
  type MapEventListingValidation,
  type MapEventSummary,
} from '@actionpop/core';

import {
  processMapDiscovery,
  type MapDiscoveryDependencies,
} from '../src/ingestion/map-discovery-processor.js';

const summary: MapEventSummary = {
  id: 'event-1',
  name: 'Meeting',
  end_time: '2027-10-23T18:00:00+02:00',
};

const validation: MapEventListingValidation = {
  summaries: [summary],
  rejected: 1,
  duplicates: 1,
  droppedHints: {
    name: 0,
    coordinates: 0,
    date: 0,
    link: 0,
    start_time: 0,
    end_time: 0,
    subtype: 1,
  },
};

function harness(overrides: Partial<MapDiscoveryDependencies> = {}) {
  const ledger: { status?: string; error?: string } = {};
  const metrics = new MetricsRegistry();
  const logger = createLogger({ service: 'test', environment: 'test', sink: () => undefined });
  const requests: EventScopeRequest[][] = [];
  const marked: string[][] = [];
  const deps: MapDiscoveryDependencies = {
    client: { fetchMapEventListing: vi.fn(async () => validation) },
    mapDiscovery: {
      recordListing: vi.fn(async () => ({ inserted: 1, changed: 1 })),
      selectGapCandidates: vi.fn(async () => ['event-1']),
      requestEventScopes: vi.fn(async (values: readonly EventScopeRequest[]) => {
        requests.push([...values]);
        return { created: values.map((value) => value.eventId), reopened: [] };
      }),
      markRequested: vi.fn(async (eventIds: readonly string[]) => {
        marked.push([...eventIds]);
        return eventIds.length;
      }),
    },
    isEnabled: async () => true,
    freshnessHorizonMs: 3_600_000,
    reconciliationIntervalMs: 604_800_000,
    ledger: {
      transition: async (_jobId, patch) => {
        ledger.status = patch.status;
        if (patch.error !== undefined) ledger.error = patch.error;
      },
    },
    metrics,
    logger,
    cycleMetrics: { increment: vi.fn(async () => undefined) },
    now: () => new Date('2026-10-31T00:00:00.000Z'),
    ...overrides,
  };
  return { deps, ledger, metrics, requests, marked };
}

const job = {
  jobId: 'ingest-v1_scope-map_discovery_period-20261031T000000Z',
  scopeId: 'map-discovery',
  periodToken: '2026-10-31T00:00:00.000Z',
  attemptsMade: 0,
  maxAttempts: 3,
};

describe('map discovery processor', () => {
  it('reads one listing, requests only selected identities and marks them requested', async () => {
    const { deps, ledger, metrics, requests, marked } = harness();

    await processMapDiscovery(job, deps);

    expect(deps.client.fetchMapEventListing).toHaveBeenCalledTimes(1);
    expect(deps.mapDiscovery.selectGapCandidates).toHaveBeenCalledWith([summary], {
      now: new Date('2026-10-31T00:00:00.000Z'),
      freshnessHorizonMs: 3_600_000,
    });
    expect(requests).toEqual([
      [
        {
          eventId: 'event-1',
          displayName: 'Meeting',
          endTime: '2027-10-23T18:00:00+02:00',
          discoverySource: 'map_listing',
        },
      ],
    ]);
    expect(marked).toEqual([['event-1']]);
    expect(ledger.status).toBe('succeeded');
    expect(metrics.snapshot().map((sample) => sample.name)).toContain(
      'actionpop_map_detail_requests_total',
    );
  });

  it('does not read the listing when the feature is disabled', async () => {
    const { deps, ledger } = harness({ isEnabled: async () => false });

    await processMapDiscovery(job, deps);

    expect(deps.client.fetchMapEventListing).not.toHaveBeenCalled();
    expect(ledger.status).toBe('stopped');
    expect(ledger.error).toBe('map discovery disabled');
  });

  it('requests nothing when no identity is selected', async () => {
    const { deps, requests, marked } = harness();
    deps.mapDiscovery.selectGapCandidates = vi.fn(async () => []);

    await processMapDiscovery(job, deps);

    expect(requests).toEqual([]);
    expect(marked).toEqual([]);
  });

  it('fails through the existing retry policy when the listing is invalid', async () => {
    const { deps, ledger } = harness();
    deps.client.fetchMapEventListing = vi.fn(async () => {
      throw new Error('invalid listing');
    });

    await expect(processMapDiscovery(job, deps)).rejects.toThrow('invalid listing');
    expect(ledger.status).toBe('failed');
  });

  it('never exposes a detail reader', () => {
    const { deps } = harness();
    expect('fetchEventDetails' in deps.client).toBe(false);
  });
});

describe('map discovery scale', () => {
  it('processes 3,000 entries with one listing read and no detail read', async () => {
    const summaries: MapEventSummary[] = Array.from({ length: 3_000 }, (_, index) => ({
      id: `event-${index}`,
      name: `Event ${index}`,
    }));
    const largeValidation: MapEventListingValidation = {
      summaries,
      rejected: 0,
      duplicates: 0,
      droppedHints: {
        name: 0,
        coordinates: 0,
        date: 0,
        link: 0,
        start_time: 0,
        end_time: 0,
        subtype: 0,
      },
    };
    const { deps, requests } = harness();
    deps.client.fetchMapEventListing = vi.fn(async () => largeValidation);
    deps.mapDiscovery.selectGapCandidates = vi.fn(async () =>
      summaries.slice(0, 10).map((summary) => summary.id),
    );

    await processMapDiscovery(job, deps);

    expect(deps.client.fetchMapEventListing).toHaveBeenCalledTimes(1);
    expect(deps.mapDiscovery.selectGapCandidates).toHaveBeenCalledWith(summaries, {
      now: new Date('2026-10-31T00:00:00.000Z'),
      freshnessHorizonMs: 3_600_000,
    });
    expect(requests[0]).toHaveLength(10);
    expect('fetchEventDetails' in deps.client).toBe(false);
  });
});
