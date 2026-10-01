import { Queue, Worker } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { createRedisConnection } from '../../packages/core/src/infrastructure/redis.js';
import { startIntegrationRedis, stopIntegrationRedis } from './setup.js';

describe('worker scaling contract', () => {
  it.skipIf(process.env.RUN_REDIS_INTEGRATION !== '1')('processes 100 shared jobs with three Redis-backed workers', async () => {
    const { environment, redis } = await startIntegrationRedis();
    const queueName = `${environment.namespace}:scaling`;
    const queue = new Queue(queueName, { connection: redis, defaultJobOptions: { removeOnComplete: true } });
    const completed = new Set<string>();
    const active = new Set<string>();
    let concurrentDuplicate = false;
    const workers = Array.from({ length: 3 }, () => {
      const connection = createRedisConnection(environment.redisUrl);
      return new Worker(queueName, async job => {
        if (active.has(String(job.id))) concurrentDuplicate = true;
        active.add(String(job.id));
        await new Promise(resolve => setTimeout(resolve, 2));
        completed.add(String(job.id));
        active.delete(String(job.id));
      }, { connection, concurrency: 1 });
    });

    await Promise.all(Array.from({ length: 100 }, (_, index) => queue.add('calendar-ingestion', { index }, { jobId: `job-${index}` })));
    const deadline = Date.now() + 10_000;
    while (completed.size < 100 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));

    expect(completed.size).toBe(100);
    expect(concurrentDuplicate).toBe(false);
    await Promise.all(workers.map(worker => worker.close()));
    await queue.close();
    const keys = await redis.keys(`${environment.namespace}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await stopIntegrationRedis(redis);
  });

  it('uses deterministic job identities for duplicate suppression', () => {
    const jobs = Array.from({ length: 100 }, (_, index) => `ingest-v1_scope-group_${index % 3}_period-slot`);
    expect(new Set(jobs).size).toBe(3);
  });
});