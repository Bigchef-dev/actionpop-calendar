import {
  buildIngestionJobId,
  calculateProcessingPeriod,
  DEFAULT_DISPATCHER_INTERVAL_MS,
  DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE,
  type ActiveScope,
} from '@actionpop/core';

import type { RedisLock } from './lock.js';

interface DispatcherQueue {
  add(name: string, data: unknown, options: { jobId: string }): Promise<unknown>;
}

/** A bare identifier is a group scope; the kind-aware form carries both kinds. */
type ScopeTarget = string | ActiveScope;

interface ScopeSource {
  activeScopes?(): readonly ScopeTarget[] | Promise<readonly ScopeTarget[]>;
  allIds?(): readonly ScopeTarget[] | Promise<readonly ScopeTarget[]>;
}

export interface DispatcherCycle {
  readonly periodToken: string;
  readonly promoted: readonly string[];
  readonly scheduled: number;
  /** Event ingestions retired because their event has ended. */
  readonly retired: number;
}

export interface DispatcherOptions {
  catalogue: ScopeSource;
  queue: DispatcherQueue;
  lock: Pick<RedisLock, 'acquire' | 'release'>;
  /** Promotes discovered groups up to the ceiling; without it, discovery is not scheduled. */
  promotion?: { promotePendingScopes(limit: number): Promise<readonly string[]> };
  /** Retires the event ingestions whose event has ended, before anything is promoted. */
  retirement?: { retireEndedScopes(now: Date): Promise<number> };
  maxNewGroupsPerCycle?: number;
  /**
   * Groups already promoted during this period. The ceiling is per cycle, not per
   * dispatcher call, so a restart mid-period cannot promote a second full batch.
   */
  scheduledThisPeriod?: (periodToken: string) => Promise<number>;
  /** True when this scope/period was already scheduled and the job still exists. */
  isHandled?: (jobId: string) => Promise<boolean>;
  onScheduled?: (jobId: string, scope: ActiveScope, periodToken: string) => Promise<void>;
  onCycle?: (cycle: DispatcherCycle) => Promise<void> | void;
  now?: () => Date;
  intervalMs?: number;
}

function toScope(target: ScopeTarget): ActiveScope {
  return typeof target === 'string' ? { scopeId: target, scopeKind: 'group' } : target;
}

function scopeList(source: ScopeSource): Promise<readonly ActiveScope[]> {
  const list =
    source.activeScopes !== undefined
      ? source.activeScopes()
      : source.allIds !== undefined
        ? source.allIds()
        : [];
  return Promise.resolve(list).then((values) => values.map(toScope));
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
        const now = options.now?.() ?? new Date();
        const period = calculateProcessingPeriod(now, intervalMs);
        const periodToken = period.periodStartUtc.toISOString();
        // An ended event must never be promoted or scheduled: retirement comes first.
        const retired =
          options.retirement === undefined ? 0 : await options.retirement.retireEndedScopes(now);
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
          scopes.map(async (scope) => {
            const jobId = buildIngestionJobId(scope.scopeId, period.periodStartUtc);
            if (options.isHandled !== undefined && (await options.isHandled(jobId))) return;
            // Recorded before the job exists: a worker can pick the job up and finish
            // it within milliseconds, and a later "scheduled" write would overwrite
            // the outcome it reported.
            await options.onScheduled?.(jobId, scope, period.periodToken);
            await options.queue.add(
              'calendar-ingestion',
              {
                scopeId: scope.scopeId,
                scopeKind: scope.scopeKind,
                periodStartUtc: period.periodStartUtc.toISOString(),
                periodEndUtc: period.periodEndUtc.toISOString(),
                periodStartEuropeParis: period.periodStartEuropeParis,
                jobVersion: 1,
              },
              { jobId },
            );
          }),
        );
        await options.onCycle?.({ periodToken, promoted, scheduled: scopes.length, retired });
      } finally {
        running = false;
        await options.lock.release(token);
      }
    },
  };
}
