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
      queue: { add: async (_name, _data, options) => { jobs.push(options.jobId); } },
      lock: { acquire: async () => 'lock-token', release: async () => undefined },
      isHandled: async (jobId: string) => jobs.includes(jobId),
      now: () => new Date('2026-10-01T12:07:00Z'),
    });

    await dispatcher.runOnce();
    await dispatcher.runOnce();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatch(/^ingest-v1_scope-group_1_period-/);
  });
});