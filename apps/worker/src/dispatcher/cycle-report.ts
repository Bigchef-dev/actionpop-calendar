import {
  CYCLE_METRICS,
  cycleMetricSamples,
  type CycleMetricReading,
  type CycleMetricSample,
  type EventScopeCounts,
  type GroupRegistryCounts,
  type Logger,
  type MetricsRegistry,
  type UnattributedCounts,
} from '@actionpop/core';

import type { DispatcherCycle } from './dispatcher.js';

export interface CycleReportDependencies {
  readonly registry: { counts(): Promise<GroupRegistryCounts> };
  /** Counts of the event ingestion kind, reported apart from the group gauges. */
  readonly eventScopes: { countEventScopes(): Promise<EventScopeCounts> };
  /** Size of the map discovery ledger; absent in runtimes without map discovery. */
  readonly mapObservations?: { countObservations(): Promise<number> };
  /** Events nobody can reach from a territory calendar; a data gap worth seeing. */
  readonly coverage?: { countUnattributed(): Promise<UnattributedCounts> };
  readonly cycleMetrics: {
    latestBefore(periodToken: string): Promise<CycleMetricReading | undefined>;
    increment(periodToken: string, samples: readonly CycleMetricSample[]): Promise<void>;
  };
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
}

/**
 * Publishes the registry state and the previous cycle's counters, which is how an
 * operator answers "how many unlisted groups, group-less events and attribution
 * changes did the last cycle produce?" without log aggregation.
 */
export async function reportDispatcherCycle(
  cycle: DispatcherCycle,
  deps: CycleReportDependencies,
): Promise<void> {
  const counts = await deps.registry.counts();
  const events = await deps.eventScopes.countEventScopes();

  deps.metrics.setGauge('actionpop_groups_active', {}, counts.active);
  deps.metrics.setGauge('actionpop_groups_pending', {}, counts.pending);
  deps.metrics.setGauge('actionpop_groups_unlisted', {}, counts.unlisted);
  deps.metrics.setGauge('actionpop_groups_stopped', {}, counts.stopped);
  deps.metrics.setGauge('actionpop_event_scopes_pending', {}, events.pending);
  deps.metrics.setGauge('actionpop_event_scopes_active', {}, events.active);
  deps.metrics.setGauge('actionpop_event_scopes_retired', {}, events.retired);
  if (deps.mapObservations !== undefined) {
    deps.metrics.setGauge(
      'actionpop_map_observations',
      {},
      await deps.mapObservations.countObservations(),
    );
  }

  if (deps.coverage !== undefined) {
    const unattributed = await deps.coverage.countUnattributed();
    for (const [status, value] of Object.entries(unattributed)) {
      deps.metrics.setGauge('actionpop_events_without_territory', { status }, value);
    }
  }

  if (cycle.promoted.length > 0) {
    deps.metrics.increment('actionpop_groups_scheduled_total', {}, cycle.promoted.length);
    await deps.cycleMetrics.increment(
      cycle.periodToken,
      cycleMetricSamples({ [CYCLE_METRICS.scheduled]: cycle.promoted.length }),
    );
  }

  if (cycle.retired > 0) {
    deps.metrics.increment('actionpop_event_ingestions_retired_total', {}, cycle.retired);
    await deps.cycleMetrics.increment(
      cycle.periodToken,
      cycleMetricSamples({ [CYCLE_METRICS.eventScopesRetired]: cycle.retired }),
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
    eventScopes: {
      active: events.active,
      pending: events.pending,
      retired: events.retired,
      retiredNow: cycle.retired,
    },
    ...(previous === undefined ? {} : { previousPeriod: previous.metrics }),
  });
}
