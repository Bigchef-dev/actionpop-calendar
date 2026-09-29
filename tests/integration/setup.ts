import { closeRedis, createRedisConnection, pingRedis } from '../../packages/core/src/infrastructure/redis.js';
import { createIntegrationTestEnvironment } from './test-environment.js';

export async function startIntegrationRedis() {
  const environment = createIntegrationTestEnvironment();
  const redis = createRedisConnection(environment.redisUrl);
  await redis.connect();
  if (!(await pingRedis(redis))) throw new Error('Redis integration healthcheck failed');
  return { environment, redis };
}

export async function stopIntegrationRedis(redis: Parameters<typeof closeRedis>[0]): Promise<void> {
  await closeRedis(redis);
}