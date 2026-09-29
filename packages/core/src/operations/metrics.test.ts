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
});