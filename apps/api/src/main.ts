import {
  checkPostgresHealth,
  checkPostgresSchema,
  closePostgres,
  createPostgresClient,
  createRedisConnection,
  describeDependencyFailures,
  CommuneNameResolver,
  FilteredCalendarService,
  loadEnvFile,
  PostgresCalendarDatasetRepository,
  PostgresCalendarEventQuery,
  PostgresGeographicReferenceRepository,
  PostgresEventQuery,
  PostgresSubjectSearch,
  probeRedis,
  runPreflight,
} from '@actionpop/core';
import { buildApp } from './server.js';
import { loadApiConfiguration, loadCorsOrigins } from './config.js';
import { logger } from './logger.js';

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
  const { config, warning, path } = loadApiConfiguration();
  if (warning !== undefined) logger.warn(warning);
  logger.info({ configurationFile: path ?? 'defaults' }, 'Configuration resolved');
  const postgres = createPostgresClient();
  logger.info(
    {
      environment: config.app.environment,
      timezone: config.app.timezone,
    },
    'API configuration loaded',
  );

  const failures = await runPreflight([
    { name: 'redis', probe: () => probeRedis(config.redis.url) },
    { name: 'postgres', probe: () => checkPostgresHealth(postgres) },
    { name: 'postgres schema', probe: () => checkPostgresSchema(postgres) },
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
    eventQuery: new PostgresEventQuery(postgres),
    subjectSearch: new PostgresSubjectSearch(postgres),
    corsOrigins: loadCorsOrigins(),
    calendarService: new FilteredCalendarService(
      new PostgresCalendarEventQuery(postgres),
      {
        lookbackDays: config.calendar.lookbackDays,
        lookaheadDays: config.calendar.lookaheadDays,
        maxEntries: config.calendar.maxEntries,
        metadata: {
          level: config.calendar.metadataLevel,
          disabledFamilies: config.calendar.disabledFamilies,
          maxGroupsPerEvent: config.calendar.maxGroupsPerEvent,
        },
      },
      new CommuneNameResolver(new PostgresGeographicReferenceRepository(postgres)),
    ),
    calendarSettings: {
      enabled: config.calendar.enabled,
      lookbackDays: config.calendar.lookbackDays,
      lookaheadDays: config.calendar.lookaheadDays,
      maxEntries: config.calendar.maxEntries,
      revalidationSeconds: config.calendar.revalidationSeconds,
      metadataLevel: config.calendar.metadataLevel,
      disabledFamilies: config.calendar.disabledFamilies,
      maxGroupsPerEvent: config.calendar.maxGroupsPerEvent,
    },
    // Off unless explicitly enabled: an exploratory console and a raw schema have no reason to
    // be reachable from the internet on a service that only serves a calendar.
    apiReference: process.env.API_REFERENCE === 'true',
    volumeBandSalt: config.observability.bandSalt,
    buildInfo: {
      deployment: config.observability.deployment,
      version: (process.env.APP_VERSION ?? '0.0.0').trim() || '0.0.0',
    },
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

  logger.info({ port }, 'Starting HTTP server');
  await app.listen(port, '0.0.0.0');
  logger.info({ port }, 'API server listening');
}

void startApi().catch((error: unknown) => {
  logger.error({ err: error }, 'API startup failed');
  process.exitCode = 1;
});
