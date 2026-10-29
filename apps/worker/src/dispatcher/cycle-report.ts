import {
  CYCLE_METRICS,
  cycleMetricSamples,
  type CycleMetricReading,
  type CycleMetricSample,
  type GroupRegistryCounts,
  type Logger,
  type MetricsRegistry,
} from '@actionpop/core';

import type { DispatcherCycle } from './dispatcher.js';

export interface CycleReportDependencies {
  readonly registry: { counts(): Promise<GroupRegistryCounts> };
  readonly cycleMetrics: {
    latestBefore(periodToken: string): Promise<CycleMetricReading | undefined>;
    increment(periodToken: string, samples: readonly CycleMetricSample[]): Promise<void>;
  };
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
}

/**
 * Publishes the registry state and the previous cycle's counters, which is how an
 * operator answers "how many unlisted groups, events without a group and
 * attribution changes did the last cycle produce?" without log aggregation.
 */
export async function reportDispatcherCycle(
  cycle: DispatcherCycle,
  deps: CycleReportDependencies,
): Promise<void> {
  const counts = await deps.registry.counts();
  deps.metrics.setGauge('actionpop_groups_active', {}, counts.active);
  deps.metrics.setGauge('actionpop_groups_pending', {}, counts.pending);
  deps.metrics.setGauge('actionpop_groups_unlisted', {}, counts.unlisted);
  deps.metrics.setGauge('actionpop_groups_stopped', {}, counts.stopped);
  if (cycle.promoted.length > 0) {
    deps.metrics.increment('actionpop_groups_scheduled_total', {}, cycle.promoted.length);
    await deps.cycleMetrics.increment(
      cycle.periodToken,
      cycleMetricSamples({ [CYCLE_METRICS.scheduled]: cycle.promoted.length }),
    );
  }

  const previous = await deps.cycleMetrics.latestBefore(cycle.periodToken);

  deps.logger.info('dispatcher cycle', {
    operation: 'dispatcher-cycle',
    outcome: 'completed',
    promoted: cycle.promoted.length,
    scheduled: cycle.scheduled,
    active: counts.active,
    pending: counts.pending,
    unlisted: counts.unlisted,
    stopped: counts.stopped,
    ...(previous === undefined ? {} : { previousPeriod: previous.metrics }),
  });
}
