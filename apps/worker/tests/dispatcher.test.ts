import { describe, expect, it } from 'vitest';

import { createDispatcher } from '../src/dispatcher/dispatcher.js';
import { RedisLock } from '../src/dispatcher/lock.js';

class Store {
  value?: string;
  async set(key: string, value: string, mode: 'PX', duration: number): Promise<'OK' | null> {
    void key;
    void mode;
    void duration;
    if (this.value) return null;
    this.value = value;
    return 'OK';
  }
  async del(key: string): Promise<number> { void key; this.value = undefined; return 1; }
}

describe('dispatcher', () => {
  it('uses the 15-minute default and enqueues active scopes once per period', async () => {
    const jobs: string[] = [];
    const dispatcher = createDispatcher({
      catalogue: { activeScopes: () => ['group-1', 'group-2'] },
      queue: { add: async (_name, _data, options) => { jobs.push(options.jobId); } },
      lock: new RedisLock(new Store(), 'dispatcher-lock'),
      now: () => new Date('2026-09-30T12:07:00Z'),
    });
    expect(dispatcher.intervalMs).toBe(15 * 60 * 1000);
    await dispatcher.runOnce();
    await dispatcher.runOnce();
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs).size).toBe(2);
    expect(jobs[0]).toMatch(/^ingest-v1_scope-group_1_period-/);
  });
});