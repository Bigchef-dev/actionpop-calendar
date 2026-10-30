import { describe, expect, it } from 'vitest';

import type { ActiveScope } from '@actionpop/core';

import { createDispatcher } from '../src/dispatcher/dispatcher.js';
import { RedisLock } from '../src/dispatcher/lock.js';

class LockStore {
  value?: string;
  async set(): Promise<'OK' | null> {
    if (this.value) return null;
    this.value = 'token';
    return 'OK';
  }
  async del(): Promise<number> {
    this.value = undefined;
    return 1;
  }
}

interface ScheduledJob {
  jobId: string;
  scopeId: string;
  scopeKind: string;
}

function setup(ceiling: number) {
  const clock = { now: new Date('2026-10-29T10:07:00Z') };
  const active: ActiveScope[] = [{ scopeId: 'listed-1', scopeKind: 'group' }];
  const backlog: ActiveScope[][] = [
    [
      { scopeId: 'group-new', scopeKind: 'group' },
      { scopeId: 'event-new', scopeKind: 'event' },
      { scopeId: 'event-later', scopeKind: 'event' },
    ],
  ];
  const jobs: ScheduledJob[] = [];
  const ledger: ScheduledJob[] = [];
  const limits: number[] = [];
  const scheduled = new Map<string, number>();

  const dispatcher = createDispatcher({
    catalogue: { activeScopes: () => active },
    promotion: {
      async promotePendingScopes(limit) {
        limits.push(limit);
        const promoted = (backlog.shift() ?? []).slice(0, limit);
        active.push(...promoted);
        return promoted.map((scope) => scope.scopeId);
      },
    },
    maxNewGroupsPerCycle: ceiling,
    scheduledThisPeriod: async (periodToken) => scheduled.get(periodToken) ?? 0,
    queue: {
      add: async (_name, data, options) => {
        const value = data as { scopeId: string; scopeKind: string };
        jobs.push({ jobId: options.jobId, ...value });
      },
    },
    isHandled: async (jobId) => jobs.some((job) => job.jobId === jobId),
    onScheduled: async (jobId, scope) => {
      ledger.push({ jobId, scopeId: scope.scopeId, scopeKind: scope.scopeKind });
    },
    onCycle: (cycle) => {
      const previous = scheduled.get(cycle.periodToken) ?? 0;
      if (cycle.promoted.length > 0) {
        scheduled.set(cycle.periodToken, previous + cycle.promoted.length);
      }
    },
    lock: new RedisLock(new LockStore(), 'dispatcher-lock'),
    now: () => clock.now,
  });

  return { dispatcher, jobs, ledger, limits, scheduled, clock };
}

describe('the promotion ceiling is shared by both kinds', () => {
  it('promotes group and event scopes against one budget', async () => {
    const { dispatcher, jobs, limits } = setup(2);

    await dispatcher.runOnce();

    expect(limits).toEqual([2]);
    expect(jobs.map((job) => `${job.scopeId}:${job.scopeKind}`).sort()).toEqual([
      'event-new:event',
      'group-new:group',
      'listed-1:group',
    ]);
  });

  it('records the kind of every scheduled scope in the ledger', async () => {
    const { dispatcher, ledger } = setup(2);

    await dispatcher.runOnce();

    expect(ledger).toHaveLength(3);
    expect(ledger.every((entry) => entry.jobId.length > 0)).toBe(true);
    expect(ledger.filter((entry) => entry.scopeKind === 'event')).toHaveLength(1);
    expect(ledger.filter((entry) => entry.scopeKind === 'group')).toHaveLength(2);
  });

  it('promotes again on the next period, still bounded by the same ceiling', async () => {
    const { dispatcher, limits, clock } = setup(1);

    await dispatcher.runOnce();
    clock.now = new Date('2026-10-29T10:22:00Z');
    await dispatcher.runOnce();
    clock.now = new Date('2026-10-29T10:37:00Z');
    await dispatcher.runOnce();

    expect(limits).toEqual([1, 1, 1]);
  });

  it('does not promote a second batch inside the same period', async () => {
    const { dispatcher, limits } = setup(1);

    await dispatcher.runOnce();
    await dispatcher.runOnce();

    expect(limits).toEqual([1]);
  });

  it('retires ended event scopes before promoting anything', async () => {
    const order: string[] = [];
    const cycles: { retired: number }[] = [];
    const active: ActiveScope[] = [
      { scopeId: 'event-ended', scopeKind: 'event' },
      { scopeId: 'group-1', scopeKind: 'group' },
    ];

    const dispatcher = createDispatcher({
      catalogue: { activeScopes: () => active },
      retirement: {
        retireEndedScopes: async () => {
          order.push('retire');
          active.splice(0, 1);
          return 1;
        },
      },
      promotion: {
        promotePendingScopes: async () => {
          order.push('promote');
          return [];
        },
      },
      scheduledThisPeriod: async () => 0,
      queue: { add: async () => undefined },
      isHandled: async () => false,
      onCycle: (cycle) => {
        cycles.push({ retired: cycle.retired });
      },
      lock: new RedisLock(new LockStore(), 'dispatcher-lock'),
      now: () => new Date('2026-10-29T10:07:00Z'),
    });

    await dispatcher.runOnce();

    expect(order).toEqual(['retire', 'promote']);
    expect(cycles).toEqual([{ retired: 1 }]);
  });

  it('enqueues a job lost by the queue again in the same period', async () => {
    const jobs: string[] = [];
    let handled = true;

    const dispatcher = createDispatcher({
      catalogue: {
        activeScopes: () => [{ scopeId: 'event-new', scopeKind: 'event' as const }],
      },
      queue: {
        add: async (_name, data) => {
          jobs.push((data as { scopeId: string }).scopeId);
        },
      },
      isHandled: async () => handled,
      lock: new RedisLock(new LockStore(), 'dispatcher-lock'),
      now: () => new Date('2026-10-29T10:07:00Z'),
    });

    await dispatcher.runOnce();
    expect(jobs).toEqual([]);

    handled = false;
    await dispatcher.runOnce();
    expect(jobs).toEqual(['event-new']);
  });
});
