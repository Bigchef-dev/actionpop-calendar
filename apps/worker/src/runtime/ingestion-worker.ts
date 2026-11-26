import { buildIngestionJobId } from '@actionpop/core';
import { Worker, type Job } from 'bullmq';

import { processIngestionJob, type IngestionDependencies } from '../ingestion/job-dispatch.js';
import { INGESTION_QUEUE_NAME } from '../queue/queue.js';
import type { WorkerInfrastructure } from './infrastructure.js';
import type { IngestionJobData } from './types.js';

/**
 * BullMQ consumes one job at a time per concurrency slot. The job carries the scope and
 * the period, so a redelivered job recomputes the same identifier and remains idempotent.
 */
export function createIngestionWorker(
  infra: WorkerInfrastructure,
  dependencies: IngestionDependencies,
): Worker<IngestionJobData> {
  return new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
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
          maxAttempts: job.opts.attempts ?? infra.config.queue.attempts,
        },
        dependencies,
      );
    },
    { connection: infra.redis, concurrency: infra.config.ingestion.workerConcurrency },
  );
}
