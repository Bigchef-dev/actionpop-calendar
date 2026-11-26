import { loadEnvFile } from '@actionpop/core';

import { createWorkerObservability } from '../operations/observability.js';
import { createWorkerRuntime } from './runtime.js';

/**
 * Process entrypoint. `startWorker` owns the last-resort safety nets: an escaped
 * rejection is logged instead of terminating the process mid-cycle, and SIGTERM/SIGINT
 * close the pool and connections so the container exits cleanly.
 */
export async function startWorker(): Promise<void> {
  loadEnvFile();
  const { logger } = createWorkerObservability();
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
  process.once('SIGTERM', () => void runtime.close());
  process.once('SIGINT', () => void runtime.close());
}
