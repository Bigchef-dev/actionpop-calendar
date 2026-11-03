import { describe, expect, it } from 'vitest';

import { MetricsRegistry } from '@actionpop/core';

import { recordCalendarRequest } from '../../apps/api/src/observability/calendar-metrics.js';
import { routeTemplate } from '../../apps/api/src/observability/route-template.js';

function calendarSamples(text: string): Array<Record<string, string>> {
  return [...text.matchAll(/^actionpop_calendar_requests_total\{([^}]*)\} (\d+)$/gm)].map(
    ([, labels]) =>
      Object.fromEntries(
        (labels ?? '')
          .split(',')
          .map((pair) => pair.split('='))
          .map(([name, value]) => [name, (value ?? '').replaceAll('"', '')]),
      ),
  );
}

describe('telemetry invariants', () => {
  it('always classifies a calendar request into exactly one client kind', () => {
    const metrics = new MetricsRegistry();
    const signatures = [
      'Mozilla/5.0 (X11; Linux) Thunderbird/115.0',
      'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0',
      'curl/8.4.0',
      undefined,
    ];

    for (const signature of signatures) {
      recordCalendarRequest(metrics, {
        query: { insee_commune: '35238' },
        signature,
        statusCode: 200,
      });
    }

    const samples = calendarSamples(metrics.prometheus());
    expect(samples).toHaveLength(4);
    expect(samples.map((sample) => sample.client_kind).sort()).toEqual([
      'agenda',
      'automated',
      'browser',
      'indeterminate',
    ]);
  });

  it('never records a territory identifier, a filter value or a query string', () => {
    const metrics = new MetricsRegistry();
    recordCalendarRequest(metrics, {
      query: {
        insee_commune: '35238',
        event_type: 'tractage,collage',
        group: 'ga-rennes',
      },
      signature: 'Mozilla/5.0 Chrome/120.0.0.0',
      statusCode: 200,
    });

    const text = metrics.prometheus();
    expect(text).not.toContain('35238');
    expect(text).not.toContain('tractage');
    expect(text).not.toContain('ga-rennes');
    // Two subject parameters combined are counted as `multi`, never as one of them.
    expect(text).toContain('subject_kind="multi"');

    const single = new MetricsRegistry();
    recordCalendarRequest(single, {
      query: { insee_commune: '35238' },
      signature: 'Mozilla/5.0 Chrome/120.0.0.0',
      statusCode: 200,
    });
    expect(single.prometheus()).toContain('subject_kind="commune"');
  });

  it('separates a delivery, a renewal, a rejection and an unavailable scope', () => {
    const metrics = new MetricsRegistry();
    for (const statusCode of [200, 304, 400, 503]) {
      recordCalendarRequest(metrics, {
        query: { epci: '243500139' },
        signature: 'CalDAVClient/2.1',
        statusCode,
      });
    }

    const deliveries = calendarSamples(metrics.prometheus()).map((sample) => sample.delivery);
    expect(deliveries.sort()).toEqual(['first', 'rejected', 'revalidated', 'unavailable']);
    expect(metrics.prometheus()).not.toContain('243500139');
  });

  it('keeps every route label inside the bounded template list', () => {
    const urls = [
      '/calendar.ics?insee_commune=35238',
      '/search/subjects?q=strasbourg&kind=commune',
      '/feed/ga-rennes',
      '/events?department=35',
      '/telemetry/journey',
      '/internal/metrics',
      '/anything/else?token=secret',
    ];

    for (const url of urls) {
      const template = routeTemplate(url);
      expect(template).not.toContain('?');
      expect(template).not.toContain('35238');
      expect(template).not.toContain('secret');
    }
  });
});
