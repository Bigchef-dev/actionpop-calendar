import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';

import type { SubjectKind, SubjectReadResult, SubjectSearchReader } from '@actionpop/core';

import { buildApp } from '../src/server.js';

class StubReader implements SubjectSearchReader {
  public fail = false;

  public async read(kind: SubjectKind): Promise<SubjectReadResult> {
    if (this.fail) throw new Error('database down');
    if (kind !== 'commune') return { candidates: [], total: 0 };
    return {
      total: 2,
      candidates: [
        {
          kind: 'commune',
          id: '69123',
          label: 'Lyon',
          qualifier: 'Rhône',
          parent: 'Rhône',
          calendar: { path: '/calendar.ics', params: { insee_commune: '69123' } },
        },
      ],
    };
  }
}

const apps: NestFastifyApplication[] = [];

async function buildReaderApp(reader: SubjectSearchReader, corsOrigins: readonly string[]) {
  const app = await buildApp({
    datasetRepository: {
      getCurrent: async () => ({
        scopeId: 'group-1',
        revision: 1,
        generatedAt: new Date().toISOString(),
        events: [],
      }),
    },
    subjectSearch: reader,
    corsOrigins,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('GET /search/subjects', () => {
  it('answers with ranked subjects and the contract headers', async () => {
    const app = await buildReaderApp(new StubReader(), []);

    const response = await app.inject({ method: 'GET', url: '/search/subjects?q=lyon' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.json()).toMatchObject({
      query: 'lyon',
      total: 2,
      kindCounts: { commune: 2, department: 0, group: 0 },
      subjects: [
        {
          kind: 'commune',
          id: '69123',
          label: 'Lyon',
          calendar: { path: '/calendar.ics', params: { insee_commune: '69123' } },
        },
      ],
    });
  });

  it('reports a too-short query as a 400 with a diagnostic code', async () => {
    const app = await buildReaderApp(new StubReader(), []);

    const response = await app.inject({ method: 'GET', url: '/search/subjects?q=l' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid search request',
      diagnostics: [{ code: 'query_too_short', field: 'q' }],
    });
  });

  it('rejects an unknown kind by name', async () => {
    const app = await buildReaderApp(new StubReader(), []);

    const response = await app.inject({
      method: 'GET',
      url: '/search/subjects?q=lyon&kind=region',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain('region');
  });

  it('answers 503 when the reader fails', async () => {
    const reader = new StubReader();
    reader.fail = true;
    const app = await buildReaderApp(reader, []);

    const response = await app.inject({ method: 'GET', url: '/search/subjects?q=lyon' });

    expect(response.statusCode).toBe(503);
  });

  it('exposes a cross-origin header only for an allowed origin', async () => {
    const app = await buildReaderApp(new StubReader(), ['https://agenda.example']);

    const allowed = await app.inject({
      method: 'GET',
      url: '/search/subjects?q=lyon',
      headers: { origin: 'https://agenda.example' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://agenda.example');

    const denied = await app.inject({
      method: 'GET',
      url: '/search/subjects?q=lyon',
      headers: { origin: 'https://evil.example' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
