import { describe, expect, it } from 'vitest';

import type { CalendarDataset } from '@actionpop/core';

import { buildApp } from './server.js';

const datasetRepository = {
  getCurrent: async (): Promise<CalendarDataset | null> => null,
};

describe('generated reference', () => {
  it('serves the Scalar page and the OpenAPI document without any option', async () => {
    const app = await buildApp({ datasetRepository });
    await app.init();

    const reference = await app.inject({ method: 'GET', url: '/reference' });
    const document = await app.inject({ method: 'GET', url: '/openapi.json' });

    expect(reference.statusCode).toBe(200);
    expect(document.statusCode).toBe(200);
    expect(document.json()).toMatchObject({ info: { title: 'ActionPop Calendar API' } });
    await app.close();
  });
});
