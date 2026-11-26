import {
  countEventScopes,
  countObservations,
  PostgresEventCoverage,
  retireEndedEventScopes,
} from '@actionpop/core';

import { reportDispatcherCycle } from '../dispatcher/cycle-report.js';
import { createDispatcher } from '../dispatcher/dispatcher.js';
import { queueJobState } from '../dispatcher/job-state.js';
import { RedisLock } from '../dispatcher/lock.js';
import type { WorkerInfrastructure } from './infrastructure.js';

/**
 * Wires the dispatcher to its persistence adapters. The lock keeps a single dispatcher
 * across replicas; the ledger and the queue together decide whether a scope/period was
 * already handled, so a restart cannot reschedule the same job twice.
 */
export function createWorkerDispatcher(infra: WorkerInfrastructure) {
  const { queue, registry, ledger, cycleMetrics, postgres, config, observability } = infra;
  const lock = new RedisLock(infra.redis, 'actionpop:lock:dispatcher');

  return createDispatcher({
    catalogue: { activeScopes: () => registry.activeScopes() },
    queue,
    lock,
    intervalMs: config.queue.dispatcherIntervalMs,
    promotion: registry,
    retirement: {
      retireEndedScopes: (now) => retireEndedEventScopes(postgres, now),
    },
    maxNewGroupsPerCycle: config.ingestion.maxNewGroupsPerCycle,
    scheduledThisPeriod: async (periodToken) =>
      (await cycleMetrics.read(periodToken))?.metrics['groups.scheduled'] ?? 0,
    isHandled: async (jobId) => {
      const stored = await ledger.get(jobId);
      if (stored === undefined) return false;
      if (
        stored.status === 'succeeded' ||
        stored.status === 'failed' ||
        stored.status === 'stopped'
      ) {
        return true;
      }
      // A live ledger status only counts while the queue still owns the job.
      return (await queueJobState(queue, jobId)).kind !== 'missing';
    },
    onScheduled: (jobId, scope, periodToken) =>
      ledger.transition(jobId, {
        scopeId: scope.scopeId,
        scopeKind: scope.scopeKind,
        periodToken,
        status: 'scheduled',
        attempts: 0,
      }),
    onCycle: (cycle) =>
      reportDispatcherCycle(cycle, {
        registry,
        eventScopes: { countEventScopes: () => countEventScopes(postgres) },
        mapObservations: { countObservations: () => countObservations(postgres) },
        coverage: {
          countUnattributed: () => new PostgresEventCoverage(postgres).countUnattributed(),
        },
        cycleMetrics,
        metrics: observability.metrics,
        logger: observability.logger,
      }),
  });
}
