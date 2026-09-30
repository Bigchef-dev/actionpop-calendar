import { buildIngestionJobId, calculateProcessingPeriod, DEFAULT_DISPATCHER_INTERVAL_MS } from '@actionpop/core';

import type { GroupCatalogueRepository } from '../catalogue/group-catalogue.js';
import type { RedisLock } from './lock.js';

interface DispatcherQueue {
  add(name: string, data: unknown, options: { jobId: string }): Promise<unknown>;
}

interface DispatcherOptions {
  catalogue: Pick<GroupCatalogueRepository, 'activeScopes'>;
  queue: DispatcherQueue;
  lock: Pick<RedisLock, 'acquire' | 'release'>;
  now?: () => Date;
  intervalMs?: number;
}

export function createDispatcher(options: DispatcherOptions) {
  const intervalMs = options.intervalMs ?? DEFAULT_DISPATCHER_INTERVAL_MS;
  let running = false;
  const scheduled = new Set<string>();
  return {
    intervalMs,
    async runOnce(): Promise<void> {
      if (running) return;
      const token = await options.lock.acquire();
      if (token === null) return;
      running = true;
      try {
        const period = calculateProcessingPeriod(options.now?.() ?? new Date(), intervalMs);
        await Promise.all(options.catalogue.activeScopes().map(async (scopeId) => {
          const jobId = buildIngestionJobId(scopeId, period.periodStartUtc);
          if (scheduled.has(jobId)) return;
          await options.queue.add('calendar-ingestion', {
            scopeId, periodStartUtc: period.periodStartUtc.toISOString(), periodEndUtc: period.periodEndUtc.toISOString(),
            periodStartEuropeParis: period.periodStartEuropeParis, jobVersion: 1,
          }, { jobId });
          scheduled.add(jobId);
        }));
      } finally {
        running = false;
        await options.lock.release(token);
      }
    },
  };
}