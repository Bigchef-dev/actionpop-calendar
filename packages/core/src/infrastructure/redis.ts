import Redis from 'ioredis';

export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
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