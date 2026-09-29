import { buildRedisKey } from '../../packages/core/src/infrastructure/redis.js';

export interface IntegrationTestEnvironment {
  redisUrl: string;
  namespace: string;
  key: (...parts: string[]) => string;
}

export function createIntegrationTestEnvironment(
  env: Record<string, string | undefined> = process.env,
): IntegrationTestEnvironment {
  const runId = env.TEST_RUN_ID ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const namespace = `actionpop-test-${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  return {
    redisUrl: env.TEST_REDIS_URL ?? env.REDIS_URL ?? 'redis://localhost:6379',
    namespace,
    key: (...parts) => buildRedisKey(namespace, ...parts),
  };
}