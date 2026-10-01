import { describe, expect, it } from 'vitest';

import { createWorkerObservability } from './observability.js';

describe('worker observability', () => {
  it('supports the signals consumed by dashboards and alerts', () => {
    const observability = createWorkerObservability('test');
    observability.metrics.increment('actionpop_job_duration_seconds', { outcome: 'success' }, 0.25);
    observability.metrics.increment('actionpop_jobs_exhausted_total', { reason: 'validation' });
    observability.metrics.increment('actionpop_upstream_failures_total', { reason: 'network' });
    observability.metrics.setGauge('actionpop_ingestion_last_success_timestamp', {}, 123);

    const output = observability.metrics.prometheus();
    expect(output).toContain('actionpop_job_duration_seconds');
    expect(output).toContain('actionpop_jobs_exhausted_total');
    expect(output).toContain('actionpop_upstream_failures_total');
    expect(output).toContain('actionpop_ingestion_last_success_timestamp 123');
  });
});