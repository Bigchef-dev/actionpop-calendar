import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { CalendarDataset } from '@actionpop/core';

import { buildApp } from '../../apps/api/src/server.js';
import { ROUTE_TEMPLATES, routeTemplate } from '../../apps/api/src/observability/route-template.js';

const EDGE = readFileSync('infra/edge/https.conf', 'utf8');
const COMPOSE = readFileSync('infra/compose/docker-compose.yml', 'utf8');

const datasetRepository = { getCurrent: async (): Promise<CalendarDataset | null> => null };

/**
 * The routes the API really registers. A new controller route must not silently become public,
 * and an allowlisted path must not silently 404 because the route disappeared.
 */
const REGISTERED_ROUTES: ReadonlyArray<{ method: string; url: string; template: string }> = [
  { method: 'GET', url: '/internal/live', template: '/internal/live' },
  { method: 'GET', url: '/internal/ready', template: '/internal/ready' },
  { method: 'GET', url: '/internal/metrics', template: '/internal/metrics' },
  { method: 'GET', url: '/calendar.ics', template: '/calendar.ics' },
  { method: 'GET', url: '/search/subjects?q=lyon', template: '/search/subjects' },
  { method: 'GET', url: '/events', template: '/events' },
  { method: 'GET', url: '/feed/group-1', template: '/feed/:scopeId' },
  { method: 'POST', url: '/telemetry/journey', template: '/telemetry/journey' },
];

describe('observability reachability', () => {
  it('serves the private health and metrics surfaces inside the application', async () => {
    const app = await buildApp({ datasetRepository });
    await app.init();

    for (const url of ['/internal/live', '/internal/ready', '/internal/metrics']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
    }

    const metrics = await app.inject({ method: 'GET', url: '/internal/metrics' });
    expect(metrics.body).toContain('# TYPE actionpop_http_requests_total counter');
    await app.close();
  });

  it('maps every registered route onto a declared template', () => {
    for (const route of REGISTERED_ROUTES) {
      expect(routeTemplate(route.url), route.url).toBe(route.template);
      expect(ROUTE_TEMPLATES).toContain(route.template);
    }
  });

  it('keeps the private surfaces off the edge and on the shared network', () => {
    expect(EDGE).not.toMatch(/location[^{]*\/internal/);
    expect(COMPOSE).toContain('external: true');
    // Both metrics producers join the monitor's network; neither publishes a port.
    const apiBlock = /api:([\s\S]*?)worker:/.exec(COMPOSE)?.[1] ?? '';
    expect(apiBlock).toContain('- monitoring');
    expect(apiBlock).not.toMatch(/ports:\s*\n\s*-/);
  });

  it('exposes only the calendar paths the visitor experience calls', () => {
    const publicTemplates = new Set(ROUTE_TEMPLATES.filter((template) => !template.startsWith('/internal')));

    expect([...publicTemplates].sort()).toEqual(
      [
        '/calendar.ics',
        '/events',
        '/search/subjects',
        '/feed/:scopeId',
        '/telemetry/journey',
        '/openapi.json',
        '/other',
      ].sort(),
    );
  });
});
