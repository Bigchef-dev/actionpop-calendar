import { describe, expect, it } from 'vitest';

import { CYCLE_METRICS, CYCLE_METRIC_KEYS, cycleMetricSamples } from './cycle-metrics.js';

describe('cycle metrics', () => {
  it('uses the keys documented for operators', () => {
    expect(CYCLE_METRIC_KEYS).toEqual([
      'groups.discovered_unlisted',
      'groups.scheduled',
      'groups.stopped_unknown',
      'groups.re_enabled',
      'groups.blank_identifier',
      'events.without_group',
      'attributions.added',
      'attributions.removed',
      'event_scopes.created',
      'event_scopes.retired',
      'event_scopes.reading_failed',
      'map.entries',
      'map.rejected',
      'map.duplicates',
      'map.hints_dropped',
      'map.gap_candidates',
      'map.selected',
      'map.skipped',
      'map.outcomes_resolved',
      'map.outcomes_unknown',
      'map.outcomes_mismatched',
      'map.outcomes_failed',
    ]);
  });

  it('emits one sample per non-zero counter', () => {
    expect(
      cycleMetricSamples({
        [CYCLE_METRICS.discoveredUnlisted]: 2,
        [CYCLE_METRICS.attributionsAdded]: 5,
        [CYCLE_METRICS.attributionsRemoved]: 0,
      }),
    ).toEqual([
      { metric: 'groups.discovered_unlisted', value: 2 },
      { metric: 'attributions.added', value: 5 },
    ]);
  });

  it('writes nothing for a quiet cycle', () => {
    expect(cycleMetricSamples({})).toEqual([]);
  });
});
