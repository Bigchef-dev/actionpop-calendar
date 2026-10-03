import { describe, expect, it } from 'vitest';

import { RedisCalendarDatasetRepository } from './redis-calendar-repository.js';

class FakeRedis {
  private readonly values = new Map<string, string>();
  private readonly sets = new Map<string, string[]>();

  public seedValue(key: string, value: unknown): void {
    this.values.set(key, JSON.stringify(value));
  }

  public seedSet(key: string, values: string[]): void {
    this.sets.set(key, values);
  }

  public async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async smembers(key: string): Promise<string[]> {
    return this.sets.get(key) ?? [];
  }

  public async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map((key) => this.values.get(key) ?? null);
  }
}

describe('RedisCalendarDatasetRepository', () => {
  it('loads a complete dataset from group metadata, IDs, and event keys', async () => {
    const redis = new FakeRedis();
    redis.seedValue('actionpop:group:group-1:meta', {
      scopeId: 'group-1',
      revision: 4,
      generatedAt: '2026-09-30T12:00:00.000Z',
      eventIds: ['event-1'],
    });
    redis.seedSet('actionpop:group:group-1:events', ['event-1']);
    redis.seedValue('actionpop:event:event-1', {
      sourceEventId: 'event-1',
      summary: 'Meeting',
      startTime: '2026-10-01T10:00:00Z',
      endTime: '2026-10-01T11:00:00Z',
      sequence: 0,
    });

    await expect(new RedisCalendarDatasetRepository(redis).getCurrent('group-1')).resolves.toEqual({
      scopeId: 'group-1',
      revision: 4,
      generatedAt: '2026-09-30T12:00:00.000Z',
      events: [{
        sourceEventId: 'event-1',
        summary: 'Meeting',
        startTime: '2026-10-01T10:00:00Z',
        endTime: '2026-10-01T11:00:00Z',
        sequence: 0,
      }],
      status: 'complete',
    });
  });

  it('rejects a snapshot when an event referenced by the group is missing', async () => {
    const redis = new FakeRedis();
    redis.seedValue('actionpop:group:group-1:meta', {
      scopeId: 'group-1',
      revision: 1,
      generatedAt: '2026-09-30T12:00:00.000Z',
      eventIds: ['event-1'],
    });
    redis.seedSet('actionpop:group:group-1:events', ['event-1']);

    await expect(new RedisCalendarDatasetRepository(redis).getCurrent('group-1'))
      .rejects.toThrow(/missing event event-1/);
  });
});
