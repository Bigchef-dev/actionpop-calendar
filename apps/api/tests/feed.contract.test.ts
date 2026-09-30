import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

const dataset = {
  scopeId: 'group-1',
  revision: 2,
  generatedAt: '2026-09-30T12:00:00.000Z',
  events: [
    {
      sourceEventId: 'event-1',
      summary: 'Meeting',
      startTime: '2026-10-01T10:00:00Z',
      endTime: '2026-10-01T11:00:00Z',
      sequence: 0,
    },
  ],
};

function makeServer() {
  return buildServer({
    datasetRepository: {
      getCurrent: async (scopeId: string) => (scopeId === 'group-1' ? dataset : null),
    },
    health: { redis: async () => undefined },
  });
}

describe('calendar feed route', () => {
  it('serves a stable read-only calendar and supports conditional requests', async () => {
    const server = makeServer();
    const response = await server.inject({ method: 'GET', url: '/feed/group-1' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/calendar');
    expect(response.headers.etag).toBe('"group-1-2"');
    expect(response.body).toContain('UID:event-1@actionpop-calendar');

    const unchanged = await server.inject({
      method: 'GET',
      url: '/feed/group-1',
      headers: { 'if-none-match': '"group-1-2"' },
    });
    expect(unchanged.statusCode).toBe(304);
    expect((await server.inject({ method: 'POST', url: '/feed/group-1' })).statusCode).toBe(405);
    await server.close();
  });

  it('distinguishes invalid, unknown, and unavailable scopes', async () => {
    const invalid = await makeServer().inject({ method: 'GET', url: '/feed/!!!' });
    expect(invalid.statusCode).toBe(400);
    const unknown = await makeServer().inject({ method: 'GET', url: '/feed/missing' });
    expect(unknown.statusCode).toBe(404);
    const unavailable = await buildServer({
      datasetRepository: {
        getCurrent: async () => {
          throw new Error('redis down');
        },
      },
    }).inject({ method: 'GET', url: '/feed/group-1' });
    expect(unavailable.statusCode).toBe(503);
  });
});
