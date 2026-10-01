import { describe, expect, it } from 'vitest';

import { MetricsRegistry } from './metrics.js';

describe('metrics', () => {
  it('normalizes labels to bounded values', () => {
    const metrics = new MetricsRegistry({ outcome: ['success', 'failure'] });
    metrics.increment('job_total', { outcome: 'unexpected' });
    metrics.increment('job_total', { outcome: 'failure' });

    expect(metrics.snapshot()).toEqual([
      { name: 'job_total', labels: { outcome: 'failure' }, value: 1 },
      { name: 'job_total', labels: { outcome: 'other' }, value: 1 },
    ]);
  });

  it('exports samples in a Prometheus-compatible format', () => {
    const metrics = new MetricsRegistry();
    metrics.increment('actionpop_jobs_failed_total', { reason: 'network' });
    metrics.setGauge('actionpop_redis_ready', {}, 1);

    expect(metrics.prometheus()).toContain('actionpop_jobs_failed_total{reason="network"} 1');
    expect(metrics.prometheus()).toContain('actionpop_redis_ready 1');
  });
});