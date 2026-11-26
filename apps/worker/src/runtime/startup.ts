import type { Server } from 'node:http';

import {
  checkPostgresHealth,
  checkPostgresSchema,
  closePostgres,
  closeRedis,
  describeDependencyFailures,
  probeRedis,
  runPreflight,
} from '@actionpop/core';

import { createCycleRunner } from '../dispatcher/cycle-runner.js';
import { startHealthServer } from './health-server.js';
import type { WorkerInfrastructure } from './infrastructure.js';

export interface StartOptions {
  readonly infra: WorkerInfrastructure;
  readonly worker: { waitUntilReady(): Promise<unknown>; close(): Promise<void> };
  readonly dispatcher: { readonly intervalMs: number };
  readonly cycle: () => Promise<void>;
  readonly readiness: () => Promise<boolean>;
  readonly healthPort: number;
  readonly version: string;
}

export interface RuntimeHandles {
  readonly timer: NodeJS.Timeout;
  readonly healthServer: Server;
}

/**
 * Starts the worker only once every dependency answers. The first cycle runs before the
 * interval is armed, so a misconfiguration surfaces during startup; a failing cycle is
 * still retried by the interval rather than aborting the process.
 */
export async function startWorkerRuntime(options: StartOptions): Promise<RuntimeHandles> {
  const { infra, worker, dispatcher, cycle, readiness } = options;
  const { config, observability } = infra;
  if (infra.databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required');
  }

  const failures = await runPreflight([
    { name: 'redis', probe: () => probeRedis(config.redis.url) },
    { name: 'postgres', probe: () => checkPostgresHealth(infra.postgres) },
    { name: 'postgres schema', probe: () => checkPostgresSchema(infra.postgres) },
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

  await infra.registry.ensureMapScope(config.ingestion.mapDiscoveryEnabled);
  observability.logger.info('worker starting', {
    operation: 'startup',
    outcome: 'started',
  });

  const healthServer = await startHealthServer({
    port: options.healthPort,
    version: options.version,
    deployment: config.observability.deployment,
    readiness,
    metrics: observability.metrics,
    logger: observability.logger,
    queue: infra.queue,
  });
  observability.logger.info('worker health server listening', {
    operation: 'startup',
    outcome: 'health_ready',
  });

  try {
    await worker.waitUntilReady();
    observability.logger.info('worker redis ready', {
      operation: 'startup',
      outcome: 'redis_ready',
    });

    const runCycle = createCycleRunner(cycle, observability.logger);
    await runCycle();
    const timer = setInterval(() => {
      void runCycle();
    }, dispatcher.intervalMs);
    observability.logger.info('worker started', {
      operation: 'startup',
      outcome: 'ready',
    });

    return { timer, healthServer };
  } catch (error) {
    // A failed startup must not leave the HTTP server listening with no cycle behind it.
    await closeServer(healthServer);
    throw error;
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export async function stopWorkerRuntime(
  infra: WorkerInfrastructure,
  worker: { close(): Promise<void> },
  handles: RuntimeHandles | undefined,
): Promise<void> {
  if (handles !== undefined) {
    clearInterval(handles.timer);
    await closeServer(handles.healthServer);
  }
  await worker.close();
  await closeInfrastructure(infra);
}

/** Releases the connections and the queue without requiring a started worker (CLI use). */
export async function closeInfrastructure(infra: WorkerInfrastructure): Promise<void> {
  await infra.queue.close();
  await closeRedis(infra.redis);
  await closePostgres(infra.postgres);
}
