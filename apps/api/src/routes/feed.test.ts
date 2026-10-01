import { describe, expect, it } from 'vitest';

import { buildServer } from '../server.js';

describe('feed route boundary', () => {
  it('serves prepared data and rejects public mutations', async () => {
    const server = buildServer({
      datasetRepository: {
        getCurrent: async () => ({ scopeId: 'group-1', revision: 1, generatedAt: new Date().toISOString(), events: [] }),
      },
    });

    expect((await server.inject({ method: 'GET', url: '/feed/group-1' })).statusCode).toBe(200);
    expect((await server.inject({ method: 'DELETE', url: '/feed/group-1' })).statusCode).toBe(405);
    await server.close();
  });
});