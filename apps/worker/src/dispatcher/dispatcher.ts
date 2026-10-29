import {
  buildIngestionJobId,
  calculateProcessingPeriod,
  DEFAULT_DISPATCHER_INTERVAL_MS,
  DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE,
} from '@actionpop/core';

import type { RedisLock } from './lock.js';

interface DispatcherQueue {
  add(name: string, data: unknown, options: { jobId: string }): Promise<unknown>;
}

interface ScopeSource {
  activeScopes?(): string[] | Promise<string[]>;
  allIds?(): string[] | Promise<string[]>;
}

export interface DispatcherCycle {
  readonly periodToken: string;
  readonly promoted: readonly string[];
  readonly scheduled: number;
}

export interface DispatcherOptions {
  catalogue: ScopeSource;
  queue: DispatcherQueue;
  lock: Pick<RedisLock, 'acquire' | 'release'>;
  /** Promotes discovered groups up to the ceiling; without it, discovery is not scheduled. */
  promotion?: { promotePendingScopes(limit: number): Promise<readonly string[]> };
  maxNewGroupsPerCycle?: number;
  /**
   * Groups already promoted during this period. The ceiling is per cycle, not per
   * dispatcher call, so a restart mid-period cannot promote a second full batch.
   */
  scheduledThisPeriod?: (periodToken: string) => Promise<number>;
  /** True when this scope/period was already scheduled and the job still exists. */
  isHandled?: (jobId: string) => Promise<boolean>;
  onScheduled?: (jobId: string, scopeId: string, periodToken: string) => Promise<void>;
  onCycle?: (cycle: DispatcherCycle) => Promise<void> | void;
  now?: () => Date;
  intervalMs?: number;
}

function scopeList(source: ScopeSource): string[] | Promise<string[]> {
  if (source.activeScopes !== undefined) return source.activeScopes();
  if (source.allIds !== undefined) return source.allIds();
  return [];
}

export function createDispatcher(options: DispatcherOptions) {
  const intervalMs = options.intervalMs ?? DEFAULT_DISPATCHER_INTERVAL_MS;
  let running = false;
  return {
    intervalMs,
    async runOnce(): Promise<void> {
      if (running) return;
      const token = await options.lock.acquire();
      if (token === null) return;
      running = true;
      try {
        const period = calculateProcessingPeriod(options.now?.() ?? new Date(), intervalMs);
        const periodToken = period.periodStartUtc.toISOString();
        // Promotion happens before selection, so a group discovered in cycle N is
        // retrieved in cycle N+1 and never in the cycle that discovered it.
        const ceiling = options.maxNewGroupsPerCycle ?? DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE;
        const alreadyScheduled =
          options.scheduledThisPeriod === undefined
            ? 0
            : await options.scheduledThisPeriod(periodToken);
        const budget = Math.max(0, ceiling - alreadyScheduled);
        const promoted =
          options.promotion === undefined || budget === 0
            ? []
            : await options.promotion.promotePendingScopes(budget);
        const scopes = await scopeList(options.catalogue);
        await Promise.all(
          scopes.map(async (scopeId) => {
            const jobId = buildIngestionJobId(scopeId, period.periodStartUtc);
            if (options.isHandled !== undefined && (await options.isHandled(jobId))) return;
            // Recorded before the job exists: a worker can pick the job up and finish
            // it within milliseconds, and a later "scheduled" write would overwrite
            // the outcome it reported.
            await options.onScheduled?.(jobId, scopeId, period.periodToken);
            await options.queue.add(
              'calendar-ingestion',
              {
                scopeId,
                periodStartUtc: period.periodStartUtc.toISOString(),
                periodEndUtc: period.periodEndUtc.toISOString(),
                periodStartEuropeParis: period.periodStartEuropeParis,
                jobVersion: 1,
              },
              { jobId },
            );
          }),
        );
        await options.onCycle?.({ periodToken, promoted, scheduled: scopes.length });
      } finally {
        running = false;
        await options.lock.release(token);
      }
    },
  };
}
