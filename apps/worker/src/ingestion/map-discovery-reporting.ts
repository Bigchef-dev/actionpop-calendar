import {
  CYCLE_METRICS,
  cycleMetricSamples,
  type CycleMetricSample,
  type EventScopeRequest,
  type Logger,
  type MapEventListingValidation,
  type MapEventSummary,
  type MetricsRegistry,
} from '@actionpop/core';

export interface MapDiscoveryCounters {
  readonly entries: number;
  readonly rejected: number;
  readonly duplicates: number;
  readonly droppedHints: number;
  readonly gapCandidates: number;
  readonly selected: number;
  readonly skipped: number;
}

export function requestFor(summary: MapEventSummary): EventScopeRequest {
  return {
    eventId: summary.id,
    displayName: summary.name ?? summary.id,
    endTime: summary.end_time ?? null,
    discoverySource: 'map_listing',
  };
}

export function mapDiscoveryCounters(
  validation: MapEventListingValidation,
  gapCandidates: number,
  selected: number,
): MapDiscoveryCounters {
  const droppedHints = Object.values(validation.droppedHints).reduce(
    (total, value) => total + value,
    0,
  );
  return {
    entries: validation.summaries.length + validation.rejected + validation.duplicates,
    rejected: validation.rejected,
    duplicates: validation.duplicates,
    droppedHints,
    gapCandidates,
    selected,
    skipped: Math.max(0, gapCandidates - selected),
  };
}

export function emitMapDiscoveryMetrics(
  metrics: MetricsRegistry,
  counters: MapDiscoveryCounters,
): void {
  metrics.increment('actionpop_map_listing_entries_total', {}, counters.entries);
  metrics.increment('actionpop_map_listing_rejected_total', {}, counters.rejected);
  metrics.increment('actionpop_map_hints_dropped_total', {}, counters.droppedHints);
  metrics.increment('actionpop_map_detail_requests_total', {}, counters.selected);
}

export function mapDiscoveryCycleSamples(
  counters: MapDiscoveryCounters,
): readonly CycleMetricSample[] {
  return cycleMetricSamples({
    [CYCLE_METRICS.mapEntries]: counters.entries,
    [CYCLE_METRICS.mapRejected]: counters.rejected,
    [CYCLE_METRICS.mapDuplicates]: counters.duplicates,
    [CYCLE_METRICS.mapHintsDropped]: counters.droppedHints,
    [CYCLE_METRICS.mapGapCandidates]: counters.gapCandidates,
    [CYCLE_METRICS.mapSelected]: counters.selected,
    [CYCLE_METRICS.mapSkipped]: counters.skipped,
  });
}

export function logMapDiscovery(
  logger: Logger,
  context: {
    jobId: string;
    scopeId: string;
    durationMs: number;
    counters: MapDiscoveryCounters;
    created: number;
    reopened: number;
    inserted: number;
    changed: number;
  },
): void {
  logger.info('map discovery completed', {
    jobId: context.jobId,
    scopeId: context.scopeId,
    operation: 'map-discovery',
    outcome: 'success',
    durationMs: context.durationMs,
    entries: context.counters.entries,
    rejected: context.counters.rejected,
    duplicates: context.counters.duplicates,
    droppedHints: context.counters.droppedHints,
    gapCandidates: context.counters.gapCandidates,
    selected: context.counters.selected,
    skipped: context.counters.skipped,
    created: context.created,
    reopened: context.reopened,
    inserted: context.inserted,
    changed: context.changed,
  });
}
