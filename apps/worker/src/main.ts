import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  buildIngestionJobId,
  checkPostgresHealth,
  checkPostgresSchema,
  closePostgres,
  closeRedis,
  createPostgresClient,
  createRedisConnection,
  describeDependencyFailures,
  LEDGER_GRACE_MS,
  loadEnvFile,
  PostgresCalendarDatasetRepository,
  PostgresCycleMetrics,
  PostgresEventCoverage,
  PostgresEventTypeRepository,
  PostgresGeographicReferenceRepository,
  PostgresGeographicReferenceWriter,
  countEventScopes,
  countObservations,
  PostgresGroupRegistry,
  probeRedis,
  retireEndedEventScopes,
  retireUnknownEventScope,
  recordListing,
  selectGapCandidates,
  requestEventScopes,
  markRequested,
  recordOutcome,
  type ScopeKind,
  runPreflight,
} from '@actionpop/core';
import { Job, Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import { ActionPopulaireClient } from './adapters/action-populaire-client.js';
import { createUpstreamFetcher } from './adapters/upstream-fetcher.js';
import { PostgresGroupCatalogueRepository } from './catalogue/group-catalogue.js';
import { synchronizeDirectory } from './catalogue/directory-sync.js';
import { loadWorkerConfiguration } from './config.js';
import {
  refreshGeographicReference,
  type RefreshGeographicReferenceInput,
} from './geography/reference-refresh.js';
import { reEnrichEvents } from './geography/re-enrichment.js';
import { PostgresGroupAttachmentRefresher } from './geography/group-attachment-refresher.js';
import { reportDispatcherCycle } from './dispatcher/cycle-report.js';
import { createCycleRunner } from './dispatcher/cycle-runner.js';
import { createDispatcher } from './dispatcher/dispatcher.js';
import { queueJobState } from './dispatcher/job-state.js';
import { RedisLock } from './dispatcher/lock.js';
import { processIngestionJob, type IngestionDependencies } from './ingestion/job-dispatch.js';
import { PostgresIngestionLedgerStore } from './operations/ingestion-ledger.js';
import { reconcileIngestionLedger } from './operations/ledger-reconciliation.js';
import { createWorkerObservability } from './operations/observability.js';
import { PostgresSnapshotPublisher, SnapshotPublisher } from './persistence/snapshot-publisher.js';
import { buildQueueOptions } from './queue/queue.js';

export { toIncomingEvent } from './ingestion/event-mapper.js';
export { EventTypeValidationError } from './ingestion/calendar-ingestion-processor.js';

const QUEUE_NAME = 'calendar-ingestion';

interface IngestionJobData {
  scopeId: string;
  /** Absent for a job enqueued before this feature; such a job is a group listing. */
  scopeKind?: ScopeKind;
  periodStartUtc: string;
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
  counts: { communes: number; departments: number; epcis: number; memberships: number };
  diagnosticCount: number;
}

export function createWorkerRuntime(
  env: Record<string, string | undefined> = process.env,
): WorkerRuntime {
  const { config, warning, configurationPath } = loadWorkerConfiguration(env);
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
  const registry = new PostgresGroupRegistry(postgres);
  const cycleMetrics = new PostgresCycleMetrics(postgres);
  const ledger = new PostgresIngestionLedgerStore(postgres);
  const client = new ActionPopulaireClient({
    baseUrl: config.upstream!.baseUrl,
    ...(config.upstreamToken === undefined ? {} : { token: config.upstreamToken }),
    fetcher: createUpstreamFetcher(config.sockProxy),
  });
  const groupAttachments = new PostgresGroupAttachmentRefresher(postgres, client);
  const publisher = new PostgresSnapshotPublisher(new PostgresCalendarDatasetRepository(postgres));
  const revisions = new SnapshotPublisher();
  const observability = createWorkerObservability(config.app.environment);
  if (warning !== undefined) observability.logger.warn(warning);
  observability.logger.info('Configuration resolved', {
    configurationFile: configurationPath ?? 'defaults',
  });

  const ingestionDependencies: IngestionDependencies = {
    client,
    ledger,
    eventTypes,
    geographicReference,
    revisions,
    publisher,
    groups: registry,
    scopes: {
      retireUnknownEvent: (scopeId, at) => retireUnknownEventScope(postgres, scopeId, at),
    },
    metrics: observability.metrics,
    logger: observability.logger,
    cycleMetrics,
    mapDiscovery: {
      recordListing: (summaries, observedAt) => recordListing(postgres, summaries, observedAt),
      selectGapCandidates: (summaries, options) =>
        selectGapCandidates(postgres, summaries, options),
      requestEventScopes: (requests, observedAt) =>
        requestEventScopes(postgres, requests, observedAt),
      markRequested: (eventIds, requestedAt, nextReconcileAt) =>
        markRequested(postgres, eventIds, requestedAt, nextReconcileAt),
      recordOutcome: (eventId, outcome, at) =>
        recordOutcome(
          postgres,
          eventId,
          outcome,
          at,
          outcome === 'failed'
            ? at
            : new Date(at.getTime() + config.ingestion.mapReconciliationIntervalMs),
        ),
    },
    isEnabled: async () =>
      config.ingestion.mapDiscoveryEnabled && (await registry.isMapScopeActive()),
    freshnessHorizonMs: config.ingestion.mapFreshnessHorizonMs,
    reconciliationIntervalMs: config.ingestion.mapReconciliationIntervalMs,
  };

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<IngestionJobData>) => {
      const jobId = String(
        job.id ?? buildIngestionJobId(job.data.scopeId, new Date(job.data.periodStartUtc)),
      );
      await processIngestionJob(
        {
          jobId,
          scopeId: job.data.scopeId,
          scopeKind: job.data.scopeKind ?? 'group',
          periodToken: job.data.periodStartUtc,
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts ?? config.queue.attempts,
        },
        ingestionDependencies,
      );
    },
    { connection: redis, concurrency: config.ingestion.workerConcurrency },
  );

  const lock = new RedisLock(redis, 'actionpop:lock:dispatcher');
  const dispatcher = createDispatcher({
    catalogue: { activeScopes: () => registry.activeScopes() },
    queue,
    lock,
    intervalMs: config.queue.dispatcherIntervalMs,
    promotion: registry,
    retirement: {
      retireEndedScopes: (now) => retireEndedEventScopes(postgres, now),
    },
    maxNewGroupsPerCycle: config.ingestion.maxNewGroupsPerCycle,
    scheduledThisPeriod: async (periodToken) =>
      (await cycleMetrics.read(periodToken))?.metrics['groups.scheduled'] ?? 0,
    isHandled: async (jobId) => {
      const stored = await ledger.get(jobId);
      if (stored === undefined) return false;
      if (
        stored.status === 'succeeded' ||
        stored.status === 'failed' ||
        stored.status === 'stopped'
      ) {
        return true;
      }
      // A live ledger status only counts while the queue still owns the job.
      return (await queueJobState(queue, jobId)).kind !== 'missing';
    },
    onScheduled: (jobId, scope, periodToken) =>
      ledger.transition(jobId, {
        scopeId: scope.scopeId,
        scopeKind: scope.scopeKind,
        periodToken,
        status: 'scheduled',
        attempts: 0,
      }),
    onCycle: (cycle) =>
      reportDispatcherCycle(cycle, {
        registry,
        eventScopes: { countEventScopes: () => countEventScopes(postgres) },
        mapObservations: { countObservations: () => countObservations(postgres) },
        coverage: {
          countUnattributed: () => new PostgresEventCoverage(postgres).countUnattributed(),
        },
        cycleMetrics,
        metrics: observability.metrics,
        logger: observability.logger,
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
        epcis: result.counts.epcis,
        epciMemberships: result.counts.memberships,
        validationErrors: result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
          .length,
        durationMs: Date.now() - startedAt,
      });
      observability.metrics.increment('actionpop_geographic_refresh_total', {
        outcome: result.status,
      });
      observability.metrics.setGauge(
        'actionpop_geographic_reference_epci_count',
        {},
        result.counts.epcis,
      );
      observability.metrics.setGauge(
        'actionpop_geographic_reference_epci_membership_count',
        {},
        result.counts.memberships,
      );

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
        { name: 'postgres schema', probe: () => checkPostgresSchema(postgres) },
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
      await registry.ensureMapScope(config.ingestion.mapDiscoveryEnabled);
      observability.logger.info('worker starting', {
        operation: 'startup',
        outcome: 'started',
      });
      healthServer = createServer(async (request, response) => {
        try {
          const live = request.url === '/health/live';
          const metrics = request.url === '/metrics';
          if (metrics) {
            const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'failed');
            observability.metrics.setGauge(
              'actionpop_queue_depth',
              {},
              (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0),
            );
            observability.metrics.setGauge(
              'actionpop_redis_ready',
              {},
              (await readiness()) ? 1 : 0,
            );
            observability.metrics.setGauge(
              'actionpop_build_info',
              {
                deployment: config.observability.deployment,
                version: (process.env.APP_VERSION ?? '0.0.0').trim() || '0.0.0',
              },
              1,
            );
            response.statusCode = 200;
            response.setHeader('content-type', 'text/plain; version=0.0.4');
            response.end(observability.metrics.prometheus());
            return;
          }
          const ready = live || (request.url === '/health/ready' && (await readiness()));
          response.statusCode = ready ? 200 : 503;
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready' }));
        } catch (error) {
          // A scrape or probe must never turn a transient Redis/Postgres failure into an
          // unhandled rejection, which would stop the worker.
          observability.logger.error('health request failed', {
            operation: 'health',
            outcome: 'failure',
            failure: error instanceof Error ? error.message : 'unknown error',
          });
          if (!response.headersSent) {
            response.statusCode = 503;
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ status: 'not_ready' }));
          } else {
            response.destroy();
          }
        }
      });
      await new Promise<void>((resolve, reject) => {
        if (healthServer === undefined) {
          reject(new Error('health server could not be created'));
          return;
        }
        // Without this, a port conflict leaves the startup promise pending forever.
        const onListenError = (error: Error) => reject(error);
        healthServer.once('error', onListenError);
        healthServer.listen(Number(env.WORKER_HEALTH_PORT ?? 8081), '0.0.0.0', () => {
          healthServer?.off('error', onListenError);
          resolve();
        });
      });
      observability.logger.info('worker health server listening', {
        operation: 'startup',
        outcome: 'health_ready',
      });
      await worker.waitUntilReady();
      observability.logger.info('worker redis ready', {
        operation: 'startup',
        outcome: 'redis_ready',
      });

      const runCycle = createCycleRunner(async () => {
        // An unavailable map directory must not stop the cycle: the listings that can
        // still be retrieved are dispatched even when the directory cannot be read.
        const directory = await synchronizeDirectory(
          () => client.fetchGroupCatalogue(),
          (value) => catalogue.synchronize(value),
        );
        if (!directory.synced) {
          observability.logger.warn('map directory unavailable', {
            operation: 'catalogue-sync',
            outcome: 'skipped',
            ...(directory.failure === undefined ? {} : { failure: directory.failure }),
          });
        }

        // A spatial failure must never cost the catalogue that was just synchronized, so this
        // step reports its own outcome and never throws into the cycle.
        const activeVersion = await geographicReference.findActiveVersion().catch(() => null);
        if (activeVersion !== null) {
          const attachment = await groupAttachments
            .refresh(activeVersion.version)
            .catch((error: unknown) => {
              observability.logger.warn('group attachment failed', {
                operation: 'group-attachment',
                outcome: 'failed',
                failure: error instanceof Error ? error.message : 'unknown failure',
              });
              return undefined;
            });
          if (attachment !== undefined) {
            observability.logger.info('group attachment', {
              operation: 'group-attachment',
              outcome: 'completed',
              referenceVersion: attachment.version,
              resolved: attachment.resolved,
              incomplete: attachment.incomplete,
              international: attachment.international,
              invalid: attachment.invalid,
              skipped: attachment.skipped,
              failed: attachment.failed,
            });
            for (const outcome of [
              'resolved',
              'incomplete',
              'international',
              'invalid',
              'failed',
            ] as const) {
              observability.metrics.increment(
                'actionpop_group_attachment_total',
                { outcome },
                attachment[outcome],
              );
            }
            observability.metrics.increment(
              'actionpop_group_attachment_total',
              { outcome: 'skipped' },
              attachment.skipped,
            );
          }
        }
        const reconciled = await reconcileIngestionLedger(
          postgres,
          queue,
          new Date(Date.now() - LEDGER_GRACE_MS),
        );
        if (reconciled.succeeded + reconciled.failed > 0) {
          observability.logger.warn('ingestion ledger reconciled', {
            operation: 'ingestion-ledger',
            outcome: 'reconciled',
            ...reconciled,
          });
        }
        await dispatcher.runOnce();
      }, observability.logger);

      // A failing first cycle must not abort the whole worker: the interval still retries.
      await runCycle();
      timer = setInterval(() => {
        void runCycle();
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
  const { logger } = createWorkerObservability();
  // Last-resort safety net: an escaped rejection must be logged, not terminate the worker
  // mid-cycle. Cycles and probes handle their own errors; this only covers the unforeseen.
  process.on('uncaughtException', (error: Error) => {
    logger.error('uncaught exception', {
      operation: 'process',
      outcome: 'failure',
      failure: error.message,
    });
  });
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('unhandled promise rejection', {
      operation: 'process',
      outcome: 'failure',
      failure: reason instanceof Error ? reason.message : String(reason),
    });
  });
  const runtime = createWorkerRuntime();
  try {
    await runtime.start();
  } catch (error) {
    // Release the pool and connections: otherwise the process stays alive with open
    // handles and never dispatches anything again.
    await runtime.close().catch(() => undefined);
    throw error;
  }
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
