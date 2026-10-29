import { describe, expect, it } from 'vitest';

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

function setup(ceiling: number) {
  const active = ['listed-1'];
  const promotions: Array<readonly string[]> = [];
  const jobs: string[] = [];
  const limits: number[] = [];
  const scheduled = new Map<string, number>();

  const dispatcher = createDispatcher({
    catalogue: { activeScopes: () => [...active] },
    promotion: {
      async promotePendingScopes(limit) {
        limits.push(limit);
        const promoted = promotions.shift() ?? [];
        active.push(...promoted);
        return promoted;
      },
    },
    maxNewGroupsPerCycle: ceiling,
    scheduledThisPeriod: async (periodToken) => scheduled.get(periodToken) ?? 0,
    queue: {
      add: async (_name, _data, options) => {
        jobs.push(options.jobId);
      },
    },
    isHandled: async (jobId) => jobs.includes(jobId),
    onCycle: (cycle) => {
      const previous = scheduled.get(cycle.periodToken) ?? 0;
      if (cycle.promoted.length > 0) scheduled.set(cycle.periodToken, previous + cycle.promoted.length);
    },
    lock: new RedisLock(new LockStore(), 'dispatcher-lock'),
    now: () => new Date('2026-10-29T10:07:00Z'),
  });

  return { dispatcher, promotions, jobs, limits, active, scheduled };
}

describe('discovery scheduling ceiling', () => {
  it('promotes pending scopes with the configured ceiling before scheduling them', async () => {
    const { dispatcher, promotions, jobs, limits, active } = setup(2);

    await dispatcher.runOnce();
    expect(limits).toEqual([2]);
    expect(jobs).toHaveLength(1);

    promotions.push(['group-new-1', 'group-new-2']);
    await dispatcher.runOnce();

    expect(active).toEqual(['listed-1', 'group-new-1', 'group-new-2']);
    expect(jobs.filter((jobId) => jobId.includes('group_new_1'))).toHaveLength(1);
    expect(jobs.filter((jobId) => jobId.includes('group_new_2'))).toHaveLength(1);
  });

  it('adds no work to the cycle that discovered the group', async () => {
    const { dispatcher, promotions, jobs } = setup(5);

    // Cycle that discovered the group: promotion returns nothing.
    await dispatcher.runOnce();
    expect(jobs.some((jobId) => jobId.includes('group_new_1'))).toBe(false);

    // Next cycle: the group has become eligible.
    promotions.push(['group-new-1']);
    await dispatcher.runOnce();
    expect(jobs.filter((jobId) => jobId.includes('group_new_1'))).toHaveLength(1);
  });

  it('never schedules a scope twice in the same cycle', async () => {
    const { dispatcher, promotions, jobs } = setup(5);

    promotions.push(['group-new-1']);
    await dispatcher.runOnce();
    await dispatcher.runOnce();

    expect(jobs).toHaveLength(2);
    expect(new Set(jobs).size).toBe(2);
  });
});

describe('the ceiling is per cycle, not per dispatcher call', () => {
  it('does not promote a second batch when the same period runs again', async () => {
    const { dispatcher, promotions, limits } = setup(2);

    promotions.push(['group-new-1', 'group-new-2']);
    await dispatcher.runOnce();
    expect(limits).toEqual([2]);

    // A restart inside the same period must not promote another ceiling.
    promotions.push(['group-new-3', 'group-new-4']);
    await dispatcher.runOnce();
    expect(limits).toEqual([2]);
  });

  it('promotes again once the next period starts', async () => {
    const scheduled = new Map<string, number>();
    const limits: number[] = [];
    let instant = new Date('2026-10-29T10:07:00Z');

    const dispatcher = createDispatcher({
      catalogue: { activeScopes: () => [] },
      promotion: {
        async promotePendingScopes(limit) {
          limits.push(limit);
          return ['group-new-1'];
        },
      },
      maxNewGroupsPerCycle: 1,
      scheduledThisPeriod: async (periodToken) => scheduled.get(periodToken) ?? 0,
      onCycle: (cycle) => {
        if (cycle.promoted.length > 0) {
          scheduled.set(cycle.periodToken, (scheduled.get(cycle.periodToken) ?? 0) + cycle.promoted.length);
        }
      },
      queue: { add: async () => undefined },
      lock: new RedisLock(new LockStore(), 'dispatcher-lock'),
      now: () => instant,
    });

    await dispatcher.runOnce();
    instant = new Date('2026-10-29T10:22:00Z');
    await dispatcher.runOnce();

    expect(limits).toEqual([1, 1]);
  });
});

describe('a job lost by the queue', () => {
  it('is enqueued again in the same period instead of staying unscheduled', async () => {
    const jobs: string[] = [];
    const ledger = new Map<string, string>([['ingest-v1_scope-lost_1_period-x', 'scheduled']]);

    const dispatcher = createDispatcher({
      catalogue: { activeScopes: () => ['lost-1'] },
      queue: {
        add: async (_name, _data, options) => {
          jobs.push(options.jobId);
        },
      },
      isHandled: async (jobId) => {
        const status = ledger.get(jobId);
        if (status === undefined) return false;
        // The ledger says scheduled, but the queue lost the job.
        return false;
      },
      lock: new RedisLock(new LockStore(), 'dispatcher-lock'),
      now: () => new Date('2026-10-29T10:07:00Z'),
    });

    await dispatcher.runOnce();
    expect(jobs).toHaveLength(1);
  });

  it('is not enqueued again while the queue still holds it', async () => {
    const jobs: string[] = [];
    const dispatcher = createDispatcher({
      catalogue: { activeScopes: () => ['group-1'] },
      queue: {
        add: async (_name, _data, options) => {
          jobs.push(options.jobId);
        },
      },
      isHandled: async () => true,
      lock: new RedisLock(new LockStore(), 'dispatcher-lock'),
      now: () => new Date('2026-10-29T10:07:00Z'),
    });

    await dispatcher.runOnce();
    expect(jobs).toEqual([]);
  });
});
