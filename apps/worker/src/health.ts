import { pingRedis, runHealthCheck, type HealthResult } from '@actionpop/core';
import type { Redis } from 'ioredis';

export async function workerReadiness(
  redis: Redis,
  queueReady: () => Promise<void>,
): Promise<HealthResult[]> {
  return Promise.all([
    runHealthCheck('redis', () =>
      pingRedis(redis).then((ready) => {
        if (!ready) throw new Error('ping failed');
      }),
    ),
    runHealthCheck('bullmq', queueReady),
  ]);
}
