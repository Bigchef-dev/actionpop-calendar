import { buildIngestionJobId, calculateProcessingPeriod, DEFAULT_DISPATCHER_INTERVAL_MS } from '@actionpop/core';

import type { GroupCatalogueRepository } from '../catalogue/group-catalogue.js';
import type { RedisLock } from './lock.js';

interface DispatcherQueue {
  add(name: string, data: unknown, options: { jobId: string }): Promise<unknown>;
}

interface DispatcherOptions {
  catalogue:
    | Pick<GroupCatalogueRepository, 'allIds'>
    | { allIds: () => Promise<string[]> }
    | { activeScopes: () => string[] | Promise<string[]> };
  queue: DispatcherQueue;
  lock: Pick<RedisLock, 'acquire' | 'release'>;
  isScheduled?: (jobId: string) => Promise<boolean>;
  onScheduled?: (jobId: string, scopeId: string, periodToken: string) => Promise<void>;
  now?: () => Date;
  intervalMs?: number;
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
        const scopes = 'activeScopes' in options.catalogue
          ? await options.catalogue.activeScopes()
          : await options.catalogue.allIds();
        await Promise.all(scopes.map(async (scopeId) => {
          const jobId = buildIngestionJobId(scopeId, period.periodStartUtc);
          if (options.isScheduled !== undefined && await options.isScheduled(jobId)) return;
          await options.queue.add('calendar-ingestion', {
            scopeId, periodStartUtc: period.periodStartUtc.toISOString(), periodEndUtc: period.periodEndUtc.toISOString(),
            periodStartEuropeParis: period.periodStartEuropeParis, jobVersion: 1,
          }, { jobId });
          await options.onScheduled?.(jobId, scopeId, period.periodToken);
        }));
      } finally {
        running = false;
        await options.lock.release(token);
      }
    },
  };
}