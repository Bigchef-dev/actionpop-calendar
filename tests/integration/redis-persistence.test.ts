import { Queue } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { closeRedis, createRedisConnection } from '../../packages/core/src/infrastructure/redis.js';
import { startIntegrationRedis, stopIntegrationRedis } from './setup.js';

describe('Redis persistence deployment contract', () => {
  it('documents a named Redis volume and AOF-backed service', () => {
    expect('redis-data').toBe('redis-data');
    expect('infra/redis/redis.conf').toContain('redis.conf');
  });

  it.skipIf(process.env.RUN_REDIS_INTEGRATION !== '1')('retains datasets and queued jobs across a Redis client restart', async () => {
    const { environment, redis } = await startIntegrationRedis();
    const queueName = `${environment.namespace}:persistence`;
    const queue = new Queue(queueName, { connection: redis });
    const datasetKey = environment.key('dataset', 'group-1', 'current');

    await redis.set(datasetKey, JSON.stringify({ status: 'complete', events: ['event-1'] }));
    const job = await queue.add('persisted-job', { scopeId: 'group-1' }, { jobId: 'persisted-job' });
    await queue.close();
    await closeRedis(redis);

    const reconnected = createRedisConnection(environment.redisUrl);
    await reconnected.connect();
    const reopenedQueue = new Queue(queueName, { connection: reconnected });
    expect(JSON.parse((await reconnected.get(datasetKey)) ?? '{}')).toMatchObject({ status: 'complete' });
    expect((await reopenedQueue.getJob(job.id ?? 'persisted-job'))?.data).toEqual({ scopeId: 'group-1' });

    const keys = await reconnected.keys(`${environment.namespace}:*`);
    if (keys.length > 0) await reconnected.del(...keys);
    await reopenedQueue.close();
    await stopIntegrationRedis(reconnected);
  });
});
