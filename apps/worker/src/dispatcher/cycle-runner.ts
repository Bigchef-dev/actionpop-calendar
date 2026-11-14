import type { Logger } from '@actionpop/core';

type CycleLogger = Pick<Logger, 'warn' | 'error'>;

export interface CycleRunner {
  /** Runs one cycle; never rejects, and never overlaps the previous run. */
  (): Promise<void>;
}

/**
 * Keeps a periodic cycle from taking the process down. The interval callback cannot
 * await its own promise, so an escaped failure becomes an unhandled rejection and Node
 * terminates the worker mid-flight; the error is logged and the next cycle still runs.
 * Overlapping invocations are skipped so a slow cycle cannot pile up behind itself.
 */
export function createCycleRunner(run: () => Promise<void>, logger: CycleLogger): CycleRunner {
  let running = false;
  return async () => {
    if (running) {
      logger.warn('dispatcher cycle skipped', {
        operation: 'dispatcher-cycle',
        outcome: 'skipped',
        reason: 'previous_cycle_running',
      });
      return;
    }
    running = true;
    try {
      await run();
    } catch (error) {
      logger.error('dispatcher cycle failed', {
        operation: 'dispatcher-cycle',
        outcome: 'failure',
        failure: error instanceof Error ? error.message : 'unknown error',
      });
    } finally {
      running = false;
    }
  };
}
