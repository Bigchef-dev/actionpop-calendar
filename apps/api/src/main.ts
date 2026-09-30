import { createRedisConnection, CalendarDatasetRepository } from '@actionpop/core';

import { buildServer } from './server.js';
import { loadApiConfig } from './config.js';

export async function startApi(): Promise<void> {
  const config = loadApiConfig();
  const redis = createRedisConnection(config.redisUrl);
  await redis.connect();
  const server = buildServer({
    datasetRepository: new CalendarDatasetRepository(redis),
    health: {
      redis: async () => {
        await redis.ping();
      },
    },
  });
  const shutdown = async () => {
    await server.close();
    await redis.quit();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  await server.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
}

if (process.argv[1]?.endsWith('/main.js')) void startApi();
