import { describe, expect, it } from 'vitest';

import { MetricsRegistry } from '@actionpop/core';

/**
 * Two producers wrote the same unlabelled gauge before this feature, so a successful map
 * discovery silently refreshed the calendar's freshness and the staleness alert could never fire.
 */
describe('ingestion freshness', () => {
  it('keeps one series per source instead of overwriting', () => {
    const metrics = new MetricsRegistry();

    metrics.setGauge('actionpop_ingestion_last_success_timestamp', { source: 'calendar' }, 1000);
    metrics.setGauge('actionpop_ingestion_last_success_timestamp', { source: 'map' }, 2000);

    const text = metrics.prometheus();
    expect(text).toContain('actionpop_ingestion_last_success_timestamp{source="calendar"} 1000');
    expect(text).toContain('actionpop_ingestion_last_success_timestamp{source="map"} 2000');
  });

  it('lets a stalled source be distinguishable from a healthy one', () => {
    const metrics = new MetricsRegistry();
    const now = Math.floor(Date.now() / 1000);

    metrics.setGauge('actionpop_ingestion_last_success_timestamp', { source: 'calendar' }, now - 7200);
    metrics.setGauge('actionpop_ingestion_last_success_timestamp', { source: 'map' }, now);

    const text = metrics.prometheus();
    expect(text).toMatch(/source="calendar"\} \d+/);
    // The stale source keeps its own old timestamp: a fresh map run no longer hides it.
    expect(text).not.toContain(`source="calendar"} ${now}`);
  });
});
