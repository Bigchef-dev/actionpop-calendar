import { describe, expect, it } from 'vitest';

import { CalendarDatasetRepository } from './calendar-dataset-repository.js';

class FakeRedis {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }
}

describe('CalendarDatasetRepository', () => {
  it('reads and writes complete current snapshots using namespaced keys', async () => {
    const redis = new FakeRedis();
    const repository = new CalendarDatasetRepository(redis, 'test-run');
    const snapshot = {
      scopeId: 'Group 1',
      revision: 3,
      generatedAt: '2026-09-30T12:00:00.000Z',
      events: [],
    };

    await repository.saveCurrent(snapshot);
    await expect(repository.getCurrent('Group 1')).resolves.toEqual(snapshot);
  });

  it('returns null for missing or incomplete snapshots', async () => {
    const repository = new CalendarDatasetRepository(new FakeRedis(), 'test-run');
    await expect(repository.getCurrent('missing')).resolves.toBeNull();
  });
});
