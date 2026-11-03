import { describe, expect, it } from 'vitest';

import type { CalendarDataset } from '@actionpop/core';

import { buildApp } from './server.js';

const datasetRepository = {
  getCurrent: async (): Promise<CalendarDataset | null> => null,
};

describe('exploratory surfaces', () => {
  it('answers 404 for the reference and the document by default', async () => {
    const app = await buildApp({ datasetRepository });
    await app.init();

    const reference = await app.inject({ method: 'GET', url: '/reference' });
    const document = await app.inject({ method: 'GET', url: '/openapi.json' });

    expect(reference.statusCode).toBe(404);
    expect(document.statusCode).toBe(404);
    await app.close();
  });

  it('serves them only when explicitly enabled', async () => {
    const app = await buildApp({ datasetRepository, apiReference: true });
    await app.init();

    const document = await app.inject({ method: 'GET', url: '/openapi.json' });

    expect(document.statusCode).toBe(200);
    expect(document.json()).toMatchObject({ info: { title: 'ActionPop Calendar API' } });
    await app.close();
  });
});
