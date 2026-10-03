import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { buildIngestionJobId, classifyRetry, closeRedis, createRedisConnection, IncomingEvent, type ActionPopulaireEventPayload } from '@actionpop/core';
import { Job, Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import { ActionPopulaireClient } from './adapters/action-populaire-client.js';
import { RedisGroupCatalogueRepository } from './catalogue/group-catalogue.js';
import { loadWorkerConfig } from './config.js';
import { createDispatcher } from './dispatcher/dispatcher.js';
import { RedisLock } from './dispatcher/lock.js';
import { collectEventPages } from './ingestion/event-pages.js';
import { RedisIngestionLedgerStore } from './operations/ingestion-ledger.js';
import { createWorkerObservability } from './operations/observability.js';
import { RedisSnapshotPublisher, SnapshotPublisher } from './persistence/snapshot-publisher.js';
import { buildQueueOptions } from './queue/queue.js';

const QUEUE_NAME = 'calendar-ingestion';

interface IngestionJobData {
  scopeId: string;
  periodStartUtc: string;
}

function toIncomingEvent(event: ActionPopulaireEventPayload) : IncomingEvent {
  return {
    id: event.id,
    name: event.name,
    startTime: event.startTime,
    endTime: event.endTime,
    ...(event.description === undefined ? {} : { description: event.description }),
  };
}

export interface WorkerRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
  readiness(): Promise<boolean>;
}

export function createWorkerRuntime(
  env: Record<string, string | undefined> = process.env,
): WorkerRuntime {
  const config = loadWorkerConfig(env);
  const redis: Redis = createRedisConnection(config.redis.url);
  const queue = new Queue(QUEUE_NAME, {
    connection: redis,
    ...buildQueueOptions({ attempts: config.queue.attempts, backoffMs: config.queue.backoffMs }),
  });
  const catalogue = new RedisGroupCatalogueRepository(redis);
  const ledger = new RedisIngestionLedgerStore(redis);
  const client = new ActionPopulaireClient({
    baseUrl: config.upstream!.baseUrl,
    ...(config.upstreamToken === undefined ? {} : { token: config.upstreamToken }),
  });
  const publisher = new RedisSnapshotPublisher(redis);
  const revisions = new SnapshotPublisher();
  const observability = createWorkerObservability(config.app.environment);
  const worker = new Worker(QUEUE_NAME, async (job: Job<IngestionJobData>) => {
    const startedAt = Date.now();
    const jobId = String(job.id ?? buildIngestionJobId(job.data.scopeId, new Date(job.data.periodStartUtc)));
    await ledger.transition(jobId, {
      scopeId: job.data.scopeId,
      periodToken: job.data.periodStartUtc,
      status: 'running',
      attempts: job.attemptsMade + 1,
    });
    try {
      const events = await collectEventPages(
        (page, pageSize) => client.fetchEventPage(job.data.scopeId, page, pageSize),
      );
      await ledger.transition(jobId, { status: 'publishing', attempts: job.attemptsMade + 1 });
      const publication = await revisions.publish(job.data.scopeId, events.map(toIncomingEvent));
      await publisher.publish(job.data.scopeId, publication.snapshot, publication.events);
      await ledger.transition(jobId, { status: 'succeeded', attempts: job.attemptsMade + 1 });
      observability.metrics.increment('actionpop_jobs_completed_total', { outcome: 'success' });
      observability.metrics.increment('actionpop_job_duration_seconds', { outcome: 'success' }, (Date.now() - startedAt) / 1000);
      observability.metrics.setGauge('actionpop_ingestion_last_success_timestamp', {}, Math.floor(Date.now() / 1000));
      observability.logger.info('ingestion completed', {
        jobId, scopeId: job.data.scopeId, operation: 'ingestion', outcome: 'success',
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const retryDecision = classifyRetry(error);
      const retryable = retryDecision.retryable && job.attemptsMade + 1 < (job.opts.attempts ?? config.queue.attempts);
      await ledger.transition(jobId, {
        status: retryable ? 'retrying' : 'failed',
        attempts: job.attemptsMade + 1,
        error: error instanceof Error ? error.message : 'ingestion failed',
      });
      observability.metrics.increment('actionpop_jobs_failed_total', { outcome: 'failure', reason: retryDecision.reason });
      observability.metrics.increment('actionpop_job_duration_seconds', { outcome: 'failure' }, (Date.now() - startedAt) / 1000);
      if (retryDecision.retryable) {
        observability.metrics.increment('actionpop_upstream_failures_total', { reason: retryDecision.reason });
      }
      if (!retryable) {
        observability.metrics.increment('actionpop_jobs_exhausted_total', { reason: retryDecision.reason });
      } else {
        observability.metrics.increment('actionpop_jobs_retried_total', { reason: retryDecision.reason });
      }
      observability.logger.error('ingestion failed', {
        jobId, scopeId: job.data.scopeId, operation: 'ingestion', outcome: 'failure',
        durationMs: Date.now() - startedAt, failure: error instanceof Error ? error.message : 'ingestion failed',
      });
      throw error;
    }
  }, { connection: redis, concurrency: 4 });
  const lock = new RedisLock(redis, 'actionpop:lock:dispatcher');
  const dispatcher = createDispatcher({
    catalogue,
    queue,
    lock,
    intervalMs: config.queue.dispatcherIntervalMs,
    isScheduled: (jobId) => ledger.isScheduled(jobId),
    onScheduled: (jobId, scopeId, periodToken) => ledger.transition(jobId, {
      scopeId, periodToken, status: 'scheduled', attempts: 0,
    }),
  });
  let timer: NodeJS.Timeout | undefined;
  let healthServer: Server | undefined;
  const readiness = async (): Promise<boolean> => new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 2_000);
    redis.ping()
      .then(result => resolve(result === 'PONG'))
      .catch(() => resolve(false))
      .finally(() => clearTimeout(timeout));
  });

  return {
    async start() {
      observability.logger.info('worker starting', {
        operation: 'startup',
        outcome: 'started',
      });
      healthServer = createServer(async (request, response) => {
        const live = request.url === '/health/live';
        const metrics = request.url === '/metrics';
        if (metrics) {
          const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'failed');
          observability.metrics.setGauge('actionpop_queue_depth', {}, (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0));
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
      await new Promise<void>((resolve) => healthServer?.listen(Number(env.WORKER_HEALTH_PORT ?? 8081), '0.0.0.0', resolve));
      observability.logger.info('worker health server listening', {
        operation: 'startup',
        outcome: 'health_ready',
      });
      await worker.waitUntilReady();
      observability.logger.info('worker redis ready', {
        operation: 'startup',
        outcome: 'redis_ready',
      });
      await catalogue.synchronize(await client.fetchGroupCatalogue());
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
    },
    async readiness() {
      return readiness();
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

const isEntryModule = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryModule) {
  void startWorker().catch((error: unknown) => {
    console.error('worker startup failed', error);
    process.exitCode = 1;
  });
}
