import {
  checkPostgresHealth,
  closePostgres,
  createPostgresClient,
  createRedisConnection,
  describeDependencyFailures,
  loadEnvFile,
  PostgresCalendarDatasetRepository,
  probeRedis,
  runPreflight,
} from '@actionpop/core';
import { buildApp } from './server.js';
import { loadApiConfig } from './config.js';
import { logger } from './logger.js';
import { apiReference } from '@scalar/nestjs-api-reference';

process.on('uncaughtException', (error: Error) => {
  logger.error({ err: error }, 'Uncaught exception');
  process.exitCode = 1;
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  process.exitCode = 1;
});

export async function startApi(): Promise<void> {
  loadEnvFile();
  logger.info('Starting API');
  const config = loadApiConfig();
  const postgres = createPostgresClient();
  logger.info({
    environment: config.app.environment,
    timezone: config.app.timezone,
  }, 'API configuration loaded');

  const failures = await runPreflight([
    { name: 'redis', probe: () => probeRedis(config.redis.url) },
    { name: 'postgres', probe: () => checkPostgresHealth(postgres) },
  ]);

  if (failures.length > 0) {
    logger.error(
      { dependencies: failures, hint: describeDependencyFailures(failures) },
      'API startup aborted',
    );
    await closePostgres(postgres);
    process.exitCode = 1;
    return;
  }

  logger.info('Dependencies ready');

  const redis = createRedisConnection(config.redis.url);
  redis.on('error', (error: Error) => {
    logger.error({ err: error }, 'Redis connection error');
  });
  await redis.connect();

  logger.info('Building API application');
  const app = await buildApp({
    datasetRepository: new PostgresCalendarDatasetRepository(postgres),
    health: {
      redis: async () => {
        await redis.ping();
      },
      postgres: () => checkPostgresHealth(postgres),
    },
  });

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    await app.close();
    await redis.quit();
    await closePostgres(postgres);
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  const port = Number(process.env.PORT ?? 3000);

  app.use(
    '/reference',
    apiReference({
      url: '/openapi.json',
      withFastify: true,
    }),
  )

  logger.info({ port }, 'Starting HTTP server');
  await app.listen(port, '0.0.0.0');
  logger.info({ port }, 'API server listening');
}

void startApi().catch((error: unknown) => {
  logger.error({ err: error }, 'API startup failed');
  process.exitCode = 1;
});