import {
  createPostgresClient,
  createRedisConnection,
  PostgresCalendarDatasetRepository,
  PostgresCycleMetrics,
  PostgresEventTypeRepository,
  PostgresGeographicReferenceRepository,
  PostgresGeographicReferenceWriter,
  PostgresGroupRegistry,
} from '@actionpop/core';
import type { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { ActionPopulaireClient } from '../adapters/action-populaire-client.js';
import { createUpstreamFetcher } from '../adapters/upstream-fetcher.js';
import { PostgresGroupCatalogueRepository } from '../catalogue/group-catalogue.js';
import { loadWorkerConfiguration, type WorkerConfig } from '../config.js';
import { PostgresGroupAttachmentRefresher } from '../geography/group-attachment-refresher.js';
import { PostgresIngestionLedgerStore } from '../operations/ingestion-ledger.js';
import {
  createWorkerObservability,
  type WorkerObservability,
} from '../operations/observability.js';
import { PostgresSnapshotPublisher, SnapshotPublisher } from '../persistence/snapshot-publisher.js';
import { buildQueueOptions, INGESTION_QUEUE_NAME } from '../queue/queue.js';

/**
 * Everything the worker shares across the dispatcher, the job processors and the
 * lifecycle. Building it is side-effect free apart from opening connections, which is
 * what `close()` releases.
 */
export interface WorkerInfrastructure {
  readonly config: WorkerConfig;
  readonly databaseUrl: string | undefined;
  readonly redis: Redis;
  readonly postgres: PrismaClient;
  readonly geographicReference: PostgresGeographicReferenceRepository;
  readonly geographicReferenceWriter: PostgresGeographicReferenceWriter;
  readonly eventTypes: PostgresEventTypeRepository;
  readonly queue: Queue;
  readonly catalogue: PostgresGroupCatalogueRepository;
  readonly registry: PostgresGroupRegistry;
  readonly cycleMetrics: PostgresCycleMetrics;
  readonly ledger: PostgresIngestionLedgerStore;
  readonly client: ActionPopulaireClient;
  readonly publisher: PostgresSnapshotPublisher;
  readonly revisions: SnapshotPublisher;
  readonly observability: WorkerObservability;
  readonly groupAttachments: PostgresGroupAttachmentRefresher;
}

export interface WorkerInfrastructureOptions {
  /** Destination for structured logs; the CLI sends them to stderr to keep stdout parseable. */
  readonly logSink?: (line: string) => void;
}

export function createWorkerInfrastructure(
  env: Record<string, string | undefined> = process.env,
  options: WorkerInfrastructureOptions = {},
): WorkerInfrastructure {
  const { config, warning, configurationPath } = loadWorkerConfiguration(env);
  const redis = createRedisConnection(config.redis.url);
  const databaseUrl = env.DATABASE_URL;
  const postgres = createPostgresClient(databaseUrl ?? 'postgresql://localhost:5432/actionpop');
  const geographicReference = new PostgresGeographicReferenceRepository(postgres);
  const geographicReferenceWriter = new PostgresGeographicReferenceWriter(postgres);
  const eventTypes = new PostgresEventTypeRepository(postgres);
  const queue = new Queue(INGESTION_QUEUE_NAME, {
    connection: redis,
    ...buildQueueOptions({ attempts: config.queue.attempts, backoffMs: config.queue.backoffMs }),
  });
  const catalogue = new PostgresGroupCatalogueRepository(postgres);
  const registry = new PostgresGroupRegistry(postgres);
  const cycleMetrics = new PostgresCycleMetrics(postgres, config.queue.dispatcherIntervalMs);
  const ledger = new PostgresIngestionLedgerStore(postgres, config.queue.dispatcherIntervalMs);
  const client = new ActionPopulaireClient({
    baseUrl: config.upstream!.baseUrl,
    ...(config.upstreamToken === undefined ? {} : { token: config.upstreamToken }),
    fetcher: createUpstreamFetcher(config.sockProxy),
  });
  const publisher = new PostgresSnapshotPublisher(
    new PostgresCalendarDatasetRepository(postgres, config.queue.dispatcherIntervalMs),
  );
  const revisions = new SnapshotPublisher();
  const observability = createWorkerObservability(config.app.environment, options.logSink);
  const groupAttachments = new PostgresGroupAttachmentRefresher(postgres, client, {
    // Hundreds of sequential upstream reads have no visible output of their own, so the
    // cycle reports its advance; otherwise a first run looks hung rather than busy.
    onProgress: ({ processed, total, failed }) =>
      observability.logger.info('group attachment progress', {
        operation: 'group-attachment',
        outcome: 'in_progress',
        processed,
        total,
        failed,
      }),
  });

  if (warning !== undefined) observability.logger.warn(warning);
  observability.logger.info('Configuration resolved', {
    configurationFile: configurationPath ?? 'defaults',
  });

  return {
    config,
    databaseUrl,
    redis,
    postgres,
    geographicReference,
    geographicReferenceWriter,
    eventTypes,
    queue,
    catalogue,
    registry,
    cycleMetrics,
    ledger,
    client,
    publisher,
    revisions,
    observability,
    groupAttachments,
  };
}
