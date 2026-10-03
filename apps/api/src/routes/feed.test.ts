import { describe, expect, it } from 'vitest';

import { buildApp } from '../server.js';

describe('feed route boundary', () => {
  it('serves prepared data and rejects public mutations', async () => {
    const app = await buildApp({
      datasetRepository: {
        getCurrent: async () => ({ scopeId: 'group-1', revision: 1, generatedAt: new Date().toISOString(), events: [] }),
      },
    });
    const server = app.getHttpAdapter().getInstance();

    expect((await server.inject({ method: 'GET', url: '/feed/group-1' })).statusCode).toBe(200);
    expect((await server.inject({ method: 'POST', url: '/feed/group-1' })).statusCode).toBe(405);
    await app.close();
  });
});