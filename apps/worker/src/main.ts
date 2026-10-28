import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  buildIngestionJobId,
  checkPostgresHealth,
  classifyRetry,
  closePostgres,
  closeRedis,
  createPostgresClient,
  createRedisConnection,
  describeDependencyFailures,
  enrichEventGeography,
  IncomingEvent,
  LocationEvent,
  loadEnvFile,
  probeRedis,
  runPreflight,
  type ActionPopulaireEventPayload,
  type GeographicAttachment,
  type RawLocationFields,
  PostgresCalendarDatasetRepository,
  PostgresGeographicReferenceRepository,
  PostgresGeographicReferenceWriter,
  PostgresEventTypeRepository,
  validateEventType,
} from '@actionpop/core';
import {
  refreshGeographicReference,
  type RefreshGeographicReferenceInput,
} from './geography/reference-refresh.js';
import { reEnrichEvents } from './geography/re-enrichment.js';
import { Job, Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import { ActionPopulaireClient } from './adapters/action-populaire-client.js';
import { PostgresGroupCatalogueRepository } from './catalogue/group-catalogue.js';
import { loadWorkerConfig } from './config.js';
import { createDispatcher } from './dispatcher/dispatcher.js';
import { RedisLock } from './dispatcher/lock.js';
import { collectEventPages } from './ingestion/event-pages.js';
import { PostgresIngestionLedgerStore } from './operations/ingestion-ledger.js';
import { createWorkerObservability } from './operations/observability.js';
import { PostgresSnapshotPublisher, SnapshotPublisher } from './persistence/snapshot-publisher.js';
import { buildQueueOptions } from './queue/queue.js';

const QUEUE_NAME = 'calendar-ingestion';

interface IngestionJobData {
  scopeId: string;
  periodStartUtc: string;
}

function toRawLocationFields(event: ActionPopulaireEventPayload): RawLocationFields {
  const location = event.location;
  return {
    ...(location.country === undefined ? {} : { country: location.country }),
    ...(location.departement === undefined ? {} : { departement: location.departement }),
    ...(location.commune?.name === undefined ? {} : { communeName: location.commune.name }),
    ...(location.city === undefined ? {} : { city: location.city }),
    ...(location.zip === undefined ? {} : { zip: location.zip }),
  };
}

function toIncomingEvent(
  event: ActionPopulaireEventPayload,
  geography: GeographicAttachment,
): IncomingEvent {
  const location: LocationEvent | null =
    event.location === null
      ? null
      : {
          address1: event.location.address1,
          city: event.location.city,
          zip: event.location.zip,
          coordinates: event.location.coordinates,
        };

  return {
    id: event.id,
    name: event.name,
    startTime: event.startTime,
    endTime: event.endTime,
    ...(event.description === undefined ? {} : { description: event.description }),
    location,
    geography,
    ...(event.subtype?.label === undefined ? {} : { eventType: event.subtype.label }),
  };
}

export class EventTypeValidationError extends Error {
  public constructor(message: string) {
    super(`event type validation failed: ${message}`);
    this.name = 'EventTypeValidationError';
  }
}

function summarizeGeography(events: IncomingEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const status = event.geography?.geographicStatus ?? 'unavailable';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export interface WorkerRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
  readiness(): Promise<boolean>;
  refreshGeographicReference(
    input: RefreshGeographicReferenceInput,
  ): Promise<RefreshGeographicReferenceResultSummary>;
  syncObservedEventTypes(values: string[], source?: string): Promise<number>;
}

export interface RefreshGeographicReferenceResultSummary {
  version: string;
  status: 'staged' | 'active' | 'rejected';
  counts: { communes: number; departments: number };
  diagnosticCount: number;
}

export function createWorkerRuntime(
  env: Record<string, string | undefined> = process.env,
): WorkerRuntime {
  const config = loadWorkerConfig(env);
  const redis: Redis = createRedisConnection(config.redis.url);
  const databaseUrl = env.DATABASE_URL;
  const postgres = createPostgresClient(databaseUrl ?? 'postgresql://localhost:5432/actionpop');
  const geographicReference = new PostgresGeographicReferenceRepository(postgres);
  const geographicReferenceWriter = new PostgresGeographicReferenceWriter(postgres);
  const eventTypes = new PostgresEventTypeRepository(postgres);
  const queue = new Queue(QUEUE_NAME, {
    connection: redis,
    ...buildQueueOptions({ attempts: config.queue.attempts, backoffMs: config.queue.backoffMs }),
  });
  const catalogue = new PostgresGroupCatalogueRepository(postgres);
  const ledger = new PostgresIngestionLedgerStore(postgres);
  const client = new ActionPopulaireClient({
    baseUrl: config.upstream!.baseUrl,
    ...(config.upstreamToken === undefined ? {} : { token: config.upstreamToken }),
  });
  const publisher = new PostgresSnapshotPublisher(new PostgresCalendarDatasetRepository(postgres));
  const revisions = new SnapshotPublisher();
  const observability = createWorkerObservability(config.app.environment);
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<IngestionJobData>) => {
      const startedAt = Date.now();
      const jobId = String(
        job.id ?? buildIngestionJobId(job.data.scopeId, new Date(job.data.periodStartUtc)),
      );
      await ledger.transition(jobId, {
        scopeId: job.data.scopeId,
        periodToken: job.data.periodStartUtc,
        status: 'running',
        attempts: job.attemptsMade + 1,
      });
      try {
        const events = await collectEventPages((page, pageSize) =>
          client.fetchEventPage(job.data.scopeId, page, pageSize),
        );
        const enrichedEvents: IncomingEvent[] = [];
        for (const event of events) {
          const typeValidation = await validateEventType(event.subtype?.label, eventTypes);
          const blocking = typeValidation.diagnostics.filter(
            (diagnostic) => diagnostic.severity === 'error',
          );
          if (blocking.length > 0) {
            throw new EventTypeValidationError(
              blocking.map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`).join('; '),
            );
          }

          const geography = await enrichEventGeography(
            toRawLocationFields(event),
            geographicReference,
          );
          enrichedEvents.push(toIncomingEvent(event, geography));
        }
        await ledger.transition(jobId, { status: 'publishing', attempts: job.attemptsMade + 1 });
        const publication = await revisions.publish(job.data.scopeId, enrichedEvents);
        await publisher.publish(job.data.scopeId, publication.snapshot, publication.events);
        await ledger.transition(jobId, { status: 'succeeded', attempts: job.attemptsMade + 1 });
        observability.metrics.increment('actionpop_jobs_completed_total', { outcome: 'success' });
        observability.metrics.increment(
          'actionpop_job_duration_seconds',
          { outcome: 'success' },
          (Date.now() - startedAt) / 1000,
        );
        observability.metrics.setGauge(
          'actionpop_ingestion_last_success_timestamp',
          {},
          Math.floor(Date.now() / 1000),
        );
        observability.logger.info('ingestion completed', {
          jobId,
          scopeId: job.data.scopeId,
          operation: 'ingestion',
          outcome: 'success',
          durationMs: Date.now() - startedAt,
          geography: summarizeGeography(enrichedEvents),
        });
      } catch (error) {
        const retryDecision = classifyRetry(error);
        const retryable =
          retryDecision.retryable &&
          job.attemptsMade + 1 < (job.opts.attempts ?? config.queue.attempts);
        await ledger.transition(jobId, {
          status: retryable ? 'retrying' : 'failed',
          attempts: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : 'ingestion failed',
        });
        observability.metrics.increment('actionpop_jobs_failed_total', {
          outcome: 'failure',
          reason: retryDecision.reason,
        });
        observability.metrics.increment(
          'actionpop_job_duration_seconds',
          { outcome: 'failure' },
          (Date.now() - startedAt) / 1000,
        );
        if (retryDecision.retryable) {
          observability.metrics.increment('actionpop_upstream_failures_total', {
            reason: retryDecision.reason,
          });
        }
        if (!retryable) {
          observability.metrics.increment('actionpop_jobs_exhausted_total', {
            reason: retryDecision.reason,
          });
        } else {
          observability.metrics.increment('actionpop_jobs_retried_total', {
            reason: retryDecision.reason,
          });
        }
        observability.logger.error('ingestion failed', {
          jobId,
          scopeId: job.data.scopeId,
          operation: 'ingestion',
          outcome: 'failure',
          durationMs: Date.now() - startedAt,
          failure: error instanceof Error ? error.message : 'ingestion failed',
        });
        throw error;
      }
    },
    { connection: redis, concurrency: 4 },
  );
  const lock = new RedisLock(redis, 'actionpop:lock:dispatcher');
  const dispatcher = createDispatcher({
    catalogue,
    queue,
    lock,
    intervalMs: config.queue.dispatcherIntervalMs,
    isScheduled: (jobId) => ledger.isScheduled(jobId),
    onScheduled: (jobId, scopeId, periodToken) =>
      ledger.transition(jobId, {
        scopeId,
        periodToken,
        status: 'scheduled',
        attempts: 0,
      }),
  });
  let timer: NodeJS.Timeout | undefined;
  let healthServer: Server | undefined;
  const readiness = async (): Promise<boolean> =>
    new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 2_000);
      Promise.all([redis.ping(), checkPostgresHealth(postgres)])
        .then(([result]) => resolve(result === 'PONG'))
        .catch(() => resolve(false))
        .finally(() => clearTimeout(timeout));
    });

  return {
    async syncObservedEventTypes(values, source = 'action-populaire') {
      await eventTypes.recordObservedEventTypes(values, source);
      observability.logger.info('event types synced', {
        operation: 'event-type-sync',
        outcome: 'completed',
        values: values.length,
      });
      return values.length;
    },
    async refreshGeographicReference(input) {
      const startedAt = Date.now();
      const previous = await geographicReference.findActiveVersion();
      const result = await refreshGeographicReference(input, geographicReferenceWriter);
      observability.logger.info('geographic reference refresh', {
        operation: 'geographic-refresh',
        outcome: result.status,
        version: result.version,
        source: input.source,
        communes: result.counts.communes,
        departments: result.counts.departments,
        validationErrors: result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
          .length,
        durationMs: Date.now() - startedAt,
      });
      observability.metrics.increment('actionpop_geographic_refresh_total', {
        outcome: result.status,
      });

      if (result.status === 'active' && previous !== null) {
        const reEnrichment = await reEnrichEvents(postgres, geographicReference, previous.version);
        observability.logger.info('geographic re-enrichment', {
          operation: 'geographic-re-enrichment',
          outcome: 'completed',
          referenceVersion: result.version,
          examined: reEnrichment.examined,
          updated: reEnrichment.updated,
        });
      }

      return {
        version: result.version,
        status: result.status,
        counts: result.counts,
        diagnosticCount: result.diagnostics.length,
      };
    },
    async start() {
      if (databaseUrl === undefined) {
        throw new Error('DATABASE_URL is required');
      }
      const failures = await runPreflight([
        { name: 'redis', probe: () => probeRedis(config.redis.url) },
        { name: 'postgres', probe: () => checkPostgresHealth(postgres) },
      ]);
      if (failures.length > 0) {
        observability.logger.error('worker startup aborted', {
          operation: 'startup',
          outcome: 'dependency_failure',
          dependencies: failures,
          hint: describeDependencyFailures(failures),
        });
        throw new Error(describeDependencyFailures(failures));
      }
      observability.logger.info('worker starting', {
        operation: 'startup',
        outcome: 'started',
      });
      healthServer = createServer(async (request, response) => {
        const live = request.url === '/health/live';
        const metrics = request.url === '/metrics';
        if (metrics) {
          const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'failed');
          observability.metrics.setGauge(
            'actionpop_queue_depth',
            {},
            (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0),
          );
          observability.metrics.setGauge('actionpop_redis_ready', {}, (await readiness()) ? 1 : 0);
          response.statusCode = 200;
          response.setHeader('content-type', 'text/plain; version=0.0.4');
          response.end(observability.metrics.prometheus());
          return;
        }
        const ready = live || (request.url === '/health/ready' && (await readiness()));
        response.statusCode = ready ? 200 : 503;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready' }));
      });
      await new Promise<void>((resolve) =>
        healthServer?.listen(Number(env.WORKER_HEALTH_PORT ?? 8081), '0.0.0.0', resolve),
      );
      observability.logger.info('worker health server listening', {
        operation: 'startup',
        outcome: 'health_ready',
      });
      await worker.waitUntilReady();
      observability.logger.info('worker redis ready', {
        operation: 'startup',
        outcome: 'redis_ready',
      });

      const catalogueData = await client.fetchGroupCatalogue();

      await catalogue.synchronize(catalogueData);
      await dispatcher.runOnce();
      timer = setInterval(async () => {
        await catalogue.synchronize(await client.fetchGroupCatalogue());
        await dispatcher.runOnce();
      }, dispatcher.intervalMs);
      observability.logger.info('worker started', {
        operation: 'startup',
        outcome: 'ready',
      });
    },
    async close() {
      if (timer !== undefined) clearInterval(timer);
      await new Promise<void>((resolve) => healthServer?.close(() => resolve()) ?? resolve());
      await worker.close();
      await queue.close();
      await closeRedis(redis);
      await closePostgres(postgres);
    },
    async readiness() {
      return readiness();
    },
  };
}

export async function startWorker(): Promise<void> {
  loadEnvFile();
  const runtime = createWorkerRuntime();
  await runtime.start();
  const shutdown = async () => {
    await runtime.close();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

const isEntryModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryModule) {
  void startWorker().catch((error: unknown) => {
    console.error('worker startup failed', error);
    process.exitCode = 1;
  });
}
