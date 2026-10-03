import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('API observability', () => {
  it('logs request context and exports request metrics', async () => {
    const logs: string[] = [];
    const server = await buildServer({
      datasetRepository: {
        getCurrent: async () => ({
          scopeId: 'group-1', revision: 1, generatedAt: new Date().toISOString(), events: [],
        }),
      },
      logger: { info: (_message, context) => logs.push(JSON.stringify(context)), warn: () => undefined, error: () => undefined },
    });

    await server.inject({ method: 'GET', url: '/feed/group-1', headers: { 'x-request-id': 'request-1' } });
    const metrics = await server.inject({ method: 'GET', url: '/internal/metrics' });

    expect(logs.join('\n')).toContain('request-1');
    expect(logs.join('\n')).toContain('durationMs');
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.body).toContain('actionpop_http_requests_total');
    await server.close();
  });
});