import { describe, expect, it } from 'vitest';

import { createDispatcher } from './dispatcher.js';

describe('dispatcher boundary', () => {
  it('records the ledger transition before the job can be picked up', async () => {
    const order: string[] = [];
    const dispatcher = createDispatcher({
      catalogue: { activeScopes: () => ['group-1'] },
      queue: {
        add: async () => {
          order.push('enqueue');
        },
      },
      onScheduled: async () => {
        order.push('ledger');
      },
      lock: { acquire: async () => 'lock-token', release: async () => undefined },
      now: () => new Date('2026-10-01T12:07:00Z'),
    });

    await dispatcher.runOnce();

    expect(order).toEqual(['ledger', 'enqueue']);
  });

  it('creates one deterministic job per active scope and period', async () => {
    const jobs: string[] = [];
    const dispatcher = createDispatcher({
      catalogue: { allIds: async () => ['group-1'] },
      queue: {
        add: async (_name, _data, options) => {
          jobs.push(options.jobId);
        },
      },
      lock: { acquire: async () => 'lock-token', release: async () => undefined },
      isHandled: async (jobId: string) => jobs.includes(jobId),
      now: () => new Date('2026-10-01T12:07:00Z'),
    });

    await dispatcher.runOnce();
    await dispatcher.runOnce();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatch(/^ingest-v1_scope-group_1_period-/);
  });

  it('bounds how many scopes are ledgered at once', async () => {
    const scopes = Array.from({ length: 20 }, (_, index) => `group-${index}`);
    let inFlight = 0;
    let peak = 0;
    const dispatcher = createDispatcher({
      catalogue: { activeScopes: () => scopes },
      queue: { add: async () => undefined },
      onScheduled: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
      },
      lock: { acquire: async () => 'lock-token', release: async () => undefined },
      maxConcurrentScheduling: 3,
      now: () => new Date('2026-10-01T12:07:00Z'),
    });

    await dispatcher.runOnce();

    expect(peak).toBe(3);
  });

  it('keeps scheduling the other scopes when one fails', async () => {
    const scheduled: string[] = [];
    const dispatcher = createDispatcher({
      catalogue: { activeScopes: () => ['group-1', 'group-bad', 'group-3'] },
      queue: {
        add: async (_name, data) => {
          scheduled.push((data as { scopeId: string }).scopeId);
        },
      },
      onScheduled: async (jobId) => {
        if (jobId.includes('group_bad')) throw new Error('ledger unavailable');
      },
      lock: { acquire: async () => 'lock-token', release: async () => undefined },
      maxConcurrentScheduling: 1,
      now: () => new Date('2026-10-01T12:07:00Z'),
    });

    await expect(dispatcher.runOnce()).rejects.toThrow(/failed to schedule 1 scope/);
    expect(scheduled).toEqual(['group-1', 'group-3']);
  });
});
