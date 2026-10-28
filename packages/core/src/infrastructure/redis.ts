import { Redis } from 'ioredis';

export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
}

/**
 * One-shot connectivity check that never retries, so startup can report an
 * unreachable Redis instead of reconnecting forever.
 */
export async function probeRedis(redisUrl: string, connectTimeoutMs = 3_000): Promise<void> {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: connectTimeoutMs,
  });
  let failure: Error | undefined;
  probe.on('error', (error: Error) => {
    failure = error;
  });
  try {
    await probe.connect();
    await probe.ping();
  } catch {
    throw failure ?? new Error(`redis is not reachable at ${redisUrl}`);
  } finally {
    probe.disconnect();
  }
}

export function buildRedisKey(namespace: string, ...parts: string[]): string {
  const rawParts = [namespace, ...parts];
  const keyParts = rawParts.map((part) => part.trim());

  if (keyParts.some((part) => part.length === 0)) {
    throw new Error('Redis key parts cannot be empty');
  }

  return keyParts.join(':');
}

export async function pingRedis(redis: Redis): Promise<boolean> {
  return (await redis.ping()) === 'PONG';
}

export async function closeRedis(redis: Redis): Promise<void> {
  if (redis.status !== 'end') await redis.quit();
}