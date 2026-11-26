import type { Queue } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { discoverResettableJobs, removeJobsById } from './queue-maintenance.js';

interface FakeJob {
  id: string;
  data: { scopeKind?: string; periodStartUtc?: string };
  state: string;
  removed: boolean;
  remove(): Promise<void>;
  getState(): Promise<string>;
}

function job(id: string, data: FakeJob['data'], state = 'completed', failRemoval = false): FakeJob {
  return {
    id,
    data,
    state,
    removed: false,
    async remove() {
      if (failRemoval) throw new Error('locked');
      this.removed = true;
    },
    async getState() {
      return this.state;
    },
  };
}

function fakeQueue(jobs: FakeJob[], active: FakeJob[] = []): Queue {
  return {
    getJobs: async (states: string[]) =>
      states.includes('active') ? active : jobs.filter((item) => states.includes(item.state)),
    getJob: async (id: string) => [...jobs, ...active].find((item) => item.id === id),
  } as unknown as Queue;
}

const PERIOD = '2026-10-29T10:00:00.000Z';

describe('queue maintenance', () => {
  it('discovers only this period and the selected targets', async () => {
    const queue = fakeQueue([
      job('group', { scopeKind: 'group', periodStartUtc: PERIOD }),
      job('legacy', { periodStartUtc: PERIOD }),
      job('event', { scopeKind: 'event', periodStartUtc: PERIOD }),
      job('other-period', { scopeKind: 'group', periodStartUtc: '2026-10-29T11:00:00.000Z' }),
      job('map', { scopeKind: 'map', periodStartUtc: PERIOD }),
    ]);

    await expect(discoverResettableJobs(queue, ['groups'], PERIOD)).resolves.toEqual({
      removable: ['group', 'legacy'],
      active: [],
    });
  });

  it('counts active matching jobs without removing them', async () => {
    const running = job('running', { scopeKind: 'group', periodStartUtc: PERIOD }, 'active');
    const queue = fakeQueue([], [running]);

    expect((await discoverResettableJobs(queue, ['groups'], PERIOD)).active).toEqual(['running']);
    expect((await removeJobsById(queue, ['running'])).active).toEqual(['running']);
    expect(running.removed).toBe(false);
  });

  it('removes existing jobs and reports failures and missing identifiers', async () => {
    const removable = job('removable', { scopeKind: 'event', periodStartUtc: PERIOD });
    const locked = job('locked', { scopeKind: 'event', periodStartUtc: PERIOD }, 'completed', true);
    const queue = fakeQueue([removable, locked]);

    await expect(
      removeJobsById(queue, ['removable', 'locked', 'missing', 'removable']),
    ).resolves.toEqual({ removed: 1, active: [], failed: 1 });
  });
});
