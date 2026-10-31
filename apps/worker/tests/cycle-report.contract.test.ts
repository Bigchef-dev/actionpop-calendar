import { describe, expect, it } from 'vitest';

import { MetricsRegistry, type Logger } from '@actionpop/core';

import { reportDispatcherCycle } from '../src/dispatcher/cycle-report.js';

interface Logged {
  message: string;
  context?: Record<string, unknown>;
}

function logger(sink: Logged[]): Logger {
  return {
    info: (message, context) => sink.push({ message, context }),
    warn: () => undefined,
    error: () => undefined,
  };
}

const counts = { active: 7, pending: 3, unlisted: 4, stopped: 2 };
const eventCounts = { pending: 2, active: 5, retired: 3 };

function eventScopes() {
  return { countEventScopes: async () => eventCounts };
}

describe('dispatcher cycle report', () => {
  it('sets the registry gauges and logs the previous cycle counters', async () => {
    const metrics = new MetricsRegistry();
    const logs: Logged[] = [];
    const written: { periodToken: string; samples: { metric: string; value: number }[] }[] = [];

    await reportDispatcherCycle(
      {
        periodToken: '2026-10-29T10:00:00.000Z',
        promoted: ['group-a', 'group-b'],
        scheduled: 10,
        retired: 0,
      },
      {
        registry: { counts: async () => counts },
        eventScopes: eventScopes(),
        cycleMetrics: {
          latestBefore: async () => ({
            periodToken: '2026-10-29T09:45:00.000Z',
            metrics: { 'groups.discovered_unlisted': 1, 'attributions.added': 4 },
          }),
          increment: async (periodToken, samples) => {
            written.push({ periodToken, samples: [...samples] });
          },
        },
        metrics,
        logger: logger(logs),
      },
    );

    const gauges = Object.fromEntries(
      metrics.snapshot().map((sample) => [sample.name, sample.value]),
    );
    expect(gauges).toMatchObject({
      actionpop_groups_active: 7,
      actionpop_groups_pending: 3,
      actionpop_groups_unlisted: 4,
      actionpop_groups_stopped: 2,
      actionpop_groups_scheduled_total: 2,
    });
    expect(written).toEqual([
      {
        periodToken: '2026-10-29T10:00:00.000Z',
        samples: [{ metric: 'groups.scheduled', value: 2 }],
      },
    ]);
    expect(logs[0]?.message).toBe('dispatcher cycle');
    expect(logs[0]?.context).toMatchObject({
      promoted: 2,
      scheduled: 10,
      active: 7,
      pending: 3,
      unlisted: 4,
      stopped: 2,
      previousPeriod: { 'groups.discovered_unlisted': 1, 'attributions.added': 4 },
    });
  });

  it('reports no previous cycle when the cycle is the first', async () => {
    const metrics = new MetricsRegistry();
    const logs: Logged[] = [];

    await reportDispatcherCycle(
      { periodToken: '2026-10-29T10:00:00.000Z', promoted: [], scheduled: 0, retired: 0 },
      {
        registry: { counts: async () => counts },
        eventScopes: eventScopes(),
        cycleMetrics: { latestBefore: async () => undefined, increment: async () => undefined },
        metrics,
        logger: logger(logs),
      },
    );

    expect(logs[0]?.context).not.toHaveProperty('previousPeriod');
    expect(
      metrics.snapshot().some((sample) => sample.name === 'actionpop_groups_scheduled_total'),
    ).toBe(false);
  });

  it('reports event ingestions apart from the group gauges', async () => {
    const metrics = new MetricsRegistry();
    const logs: Logged[] = [];
    const written: { samples: { metric: string; value: number }[] }[] = [];

    await reportDispatcherCycle(
      { periodToken: '2026-10-29T10:00:00.000Z', promoted: [], scheduled: 1, retired: 2 },
      {
        registry: { counts: async () => counts },
        eventScopes: eventScopes(),
        cycleMetrics: {
          latestBefore: async () => undefined,
          increment: async (_periodToken, samples) => {
            written.push({ samples: [...samples] });
          },
        },
        metrics,
        logger: logger(logs),
      },
    );

    const gauges = Object.fromEntries(
      metrics.snapshot().map((sample) => [sample.name, sample.value]),
    );
    expect(gauges).toMatchObject({
      actionpop_event_scopes_pending: 2,
      actionpop_event_scopes_active: 5,
      actionpop_event_scopes_retired: 3,
      actionpop_groups_stopped: 2,
    });
    expect(gauges.actionpop_groups_stopped).toBe(counts.stopped);
    expect(written).toEqual([{ samples: [{ metric: 'event_scopes.retired', value: 2 }] }]);
    expect(logs[0]?.context).toMatchObject({
      eventScopes: { active: 5, pending: 2, retired: 3, retiredNow: 2 },
    });
  });
});

describe('map observation gauge', () => {
  it('reports the map ledger size when the runtime provides it', async () => {
    const metrics = new MetricsRegistry();

    await reportDispatcherCycle(
      { periodToken: '2026-10-29T10:00:00.000Z', promoted: [], scheduled: 0, retired: 0 },
      {
        registry: { counts: async () => counts },
        eventScopes: eventScopes(),
        mapObservations: { countObservations: async () => 42 },
        cycleMetrics: { latestBefore: async () => undefined, increment: async () => undefined },
        metrics,
        logger: logger([]),
      },
    );

    expect(
      metrics.snapshot().find((sample) => sample.name === 'actionpop_map_observations')?.value,
    ).toBe(42);
  });
});
