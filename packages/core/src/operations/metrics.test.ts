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

  it('declares every family with a TYPE and a HELP line exactly once', () => {
    const metrics = new MetricsRegistry();
    metrics.increment('actionpop_jobs_failed_total', { reason: 'network' });
    metrics.increment('actionpop_jobs_failed_total', { reason: 'timeout' });
    metrics.setGauge('actionpop_redis_ready', {}, 1);

    const text = metrics.prometheus();
    expect(text.match(/^# TYPE actionpop_jobs_failed_total counter$/gm)).toHaveLength(1);
    expect(text.match(/^# HELP actionpop_jobs_failed_total /gm)).toHaveLength(1);
    expect(text).toContain('# TYPE actionpop_redis_ready gauge');
  });

  it('keeps a declared help and rejects a family used with two types', () => {
    const metrics = new MetricsRegistry();
    metrics.declare('actionpop_calendar_requests_total', 'Calendar requests.');

    expect(metrics.prometheus()).toBe('\n');
    metrics.increment('actionpop_calendar_requests_total', {});
    expect(metrics.prometheus()).toContain('# HELP actionpop_calendar_requests_total Calendar requests.');

    expect(() => metrics.observe('actionpop_calendar_requests_total', {}, 0.1)).toThrow(
      /declared as counter, not histogram/,
    );
  });

  it('exposes a histogram as cumulative buckets, a sum and a count', () => {
    const metrics = new MetricsRegistry();
    metrics.observe('actionpop_http_request_duration_seconds', { route: '/events' }, 0.02);
    metrics.observe('actionpop_http_request_duration_seconds', { route: '/events' }, 0.2);
    metrics.observe('actionpop_http_request_duration_seconds', { route: '/events' }, 12);

    const text = metrics.prometheus();
    expect(text).toContain('# TYPE actionpop_http_request_duration_seconds histogram');
    // 0.02 falls in le=0.025, 0.2 in le=0.25, and 12 only in the implicit +Inf bucket.
    expect(text).toContain(
      'actionpop_http_request_duration_seconds_bucket{le="0.025",route="/events"} 1',
    );
    expect(text).toContain(
      'actionpop_http_request_duration_seconds_bucket{le="0.25",route="/events"} 2',
    );
    expect(text).toContain(
      'actionpop_http_request_duration_seconds_bucket{le="+Inf",route="/events"} 3',
    );
    expect(text).toContain(
      'actionpop_http_request_duration_seconds_sum{route="/events"} 12.22',
    );
    expect(text).toContain(
      'actionpop_http_request_duration_seconds_count{route="/events"} 3',
    );
  });

  it('keeps buckets monotonic and ignores unusable observations', () => {
    const metrics = new MetricsRegistry();
    for (const value of [0.001, 0.04, 0.3, 1, 8]) {
      metrics.observe('latency_seconds', {}, value);
    }
    metrics.observe('latency_seconds', {}, -1);
    metrics.observe('latency_seconds', {}, Number.NaN);

    const buckets = [...metrics.prometheus().matchAll(/_bucket\{le="([^"]+)"\} (\d+)/g)].map(
      ([, le, count]) => ({ le, count: Number(count) }),
    );

    expect(buckets.at(-1)).toEqual({ le: '+Inf', count: 5 });
    for (let index = 1; index < buckets.length; index += 1) {
      expect(buckets[index]!.count).toBeGreaterThanOrEqual(buckets[index - 1]!.count);
    }
  });

  it('identifies the instance through the deployment label', () => {
    const metrics = new MetricsRegistry({}, { deployment: 'blue' });
    metrics.setGauge('actionpop_build_info', { version: '1.2.3' }, 1);

    expect(metrics.prometheus()).toContain(
      'actionpop_build_info{deployment="blue",version="1.2.3"} 1',
    );
  });

  it('escapes label values and orders labels deterministically', () => {
    const metrics = new MetricsRegistry();
    metrics.increment('weird_total', { z: 'a"b\\c\nd', a: '1' });

    expect(metrics.prometheus()).toContain('weird_total{a="1",z="a\\"b\\\\c\\nd"} 1');
  });
});
