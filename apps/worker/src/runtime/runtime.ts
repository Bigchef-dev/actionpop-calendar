import { createDispatchCycle } from './cycle.js';
import { createWorkerDispatcher } from './dispatcher.js';
import { createReadiness } from './health.js';
import { createWorkerInfrastructure } from './infrastructure.js';
import { createIngestionDependencies } from './ingestion-dependencies.js';
import { createIngestionWorker } from './ingestion-worker.js';
import { createWorkerOperations } from './operations.js';
import { startWorkerRuntime, stopWorkerRuntime, type RuntimeHandles } from './startup.js';
import type { WorkerRuntime } from './types.js';

export type { RefreshGeographicReferenceResultSummary, WorkerRuntime } from './types.js';

const DEFAULT_HEALTH_PORT = 8081;
const DEFAULT_VERSION = '0.0.0';

/**
 * Composition root. Wiring is synchronous and side-effect free apart from opening the
 * Redis and Postgres connections; `start()` performs the dependency preflight and
 * begins consuming jobs.
 */
export function createWorkerRuntime(
  env: Record<string, string | undefined> = process.env,
): WorkerRuntime {
  const infra = createWorkerInfrastructure(env);
  const worker = createIngestionWorker(infra, createIngestionDependencies(infra));
  const dispatcher = createWorkerDispatcher(infra);
  const cycle = createDispatchCycle(infra, dispatcher);
  const readiness = createReadiness(infra.redis, infra.postgres);
  const operations = createWorkerOperations(infra);

  let handles: RuntimeHandles | undefined;
  let closing: Promise<void> | undefined;

  return {
    ...operations,
    async start() {
      handles = await startWorkerRuntime({
        infra,
        worker,
        dispatcher,
        cycle,
        readiness,
        healthPort: Number(env.WORKER_HEALTH_PORT ?? DEFAULT_HEALTH_PORT),
        version: (env.APP_VERSION ?? DEFAULT_VERSION).trim() || DEFAULT_VERSION,
      });
    },
    async close() {
      closing ??= stopWorkerRuntime(infra, worker, handles);
      await closing;
    },
    readiness,
  };
}
