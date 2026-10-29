export const CYCLE_METRICS = {
  discoveredUnlisted: 'groups.discovered_unlisted',
  scheduled: 'groups.scheduled',
  stoppedUnknown: 'groups.stopped_unknown',
  reEnabled: 'groups.re_enabled',
  blankIdentifier: 'groups.blank_identifier',
  eventsWithoutGroup: 'events.without_group',
  attributionsAdded: 'attributions.added',
  attributionsRemoved: 'attributions.removed',
} as const;

export type CycleMetricKey = (typeof CYCLE_METRICS)[keyof typeof CYCLE_METRICS];

export const CYCLE_METRIC_KEYS: readonly CycleMetricKey[] = Object.values(CYCLE_METRICS);

export interface CycleMetricSample {
  readonly metric: CycleMetricKey;
  readonly value: number;
}

/** Drops zero values so a quiet cycle writes no rows. */
export function cycleMetricSamples(
  counts: Partial<Record<CycleMetricKey, number>>,
): readonly CycleMetricSample[] {
  return CYCLE_METRIC_KEYS.flatMap((metric) => {
    const value = counts[metric] ?? 0;
    return value === 0 ? [] : [{ metric, value }];
  });
}
