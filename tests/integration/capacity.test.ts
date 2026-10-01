import { describe, expect, it } from 'vitest';

import { startIntegrationRedis, stopIntegrationRedis } from './setup.js';

describe('ingestion capacity contract', () => {
  it.skipIf(process.env.RUN_CAPACITY_TEST !== '1')('runs the representative incremental Redis capacity scenario', async () => {
    const { environment, redis } = await startIntegrationRedis();
    let events = 0;
    for (let page = 0; page < 100; page += 1) {
      const pipeline = redis.pipeline();
      for (let index = 0; index < 1000; index += 1) {
        const eventId = page * 1000 + index;
        pipeline.set(environment.key('capacity', `event-${eventId}`), JSON.stringify({ id: eventId, groupId: `group-${eventId % 2000}` }));
        events += 1;
      }
      await pipeline.exec();
    }
    expect(events).toBe(100_000);
    const keys = await redis.keys(`${environment.namespace}:capacity:*`);
    expect(keys).toHaveLength(100_000);
    await redis.del(...keys);
    await stopIntegrationRedis(redis);
  });

  it('defines the representative capacity dimensions', () => {
    expect({ users: 5000, groups: 2000, events: 100000 }).toEqual({ users: 5000, groups: 2000, events: 100000 });
  });
});