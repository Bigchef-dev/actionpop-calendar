import { describe, expect, it } from 'vitest';

import { createDispatcher } from './dispatcher.js';

describe('dispatcher boundary', () => {
  it('creates one deterministic job per active scope and period', async () => {
    const jobs: string[] = [];
    const dispatcher = createDispatcher({
      catalogue: { activeScopes: async () => ['group-1'] },
      queue: { add: async (_name, _data, options) => { jobs.push(options.jobId); } },
      lock: { acquire: async () => 'lock-token', release: async () => undefined },
      isScheduled: async jobId => jobs.includes(jobId),
      now: () => new Date('2026-10-01T12:07:00Z'),
    });

    await dispatcher.runOnce();
    await dispatcher.runOnce();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatch(/^ingest-v1_scope-group_1_period-/);
  });
});