import { createRedisConnection, closeRedis } from '@actionpop/core';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import { loadWorkerConfig } from './config.js';

export interface WorkerRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
  readiness(): Promise<boolean>;
}

export function createWorkerRuntime(
  env: Record<string, string | undefined> = process.env,
): WorkerRuntime {
  const config = loadWorkerConfig(env);
  const redis: Redis = createRedisConnection(config.redisUrl);
  const queue = new Queue('calendar-ingestion', { connection: redis });
  const worker = new Worker('calendar-ingestion', async () => undefined, { connection: redis, concurrency: 4 });

  return {
    async start() {
      await redis.connect();
    },
    async close() {
      await worker.close();
      await queue.close();
      await closeRedis(redis);
    },
    async readiness() {
      return (await redis.ping()) === 'PONG';
    },
  };
}

export async function startWorker(): Promise<void> {
  const runtime = createWorkerRuntime();
  await runtime.start();
  const shutdown = async () => {
    await runtime.close();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

if (process.argv[1]?.endsWith('/main.js')) void startWorker();
