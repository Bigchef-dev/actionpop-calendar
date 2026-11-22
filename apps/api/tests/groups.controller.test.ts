import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  GroupAreaCriteria,
  GroupListingPaging,
  GroupListingReader,
  GroupListingResult,
} from '@actionpop/core';

import { buildApp } from '../src/server.js';

const VERSION = 'communes-20261028-b81cad794b9c';

class StubReader implements GroupListingReader {
  public queries: GroupAreaCriteria[] = [];
  public paging: GroupListingPaging[] = [];
  public fail = false;

  public async findActiveVersion(): Promise<string | null> {
    return VERSION;
  }

  public async list(
    criteria: GroupAreaCriteria,
    paging: GroupListingPaging,
  ): Promise<GroupListingResult> {
    this.queries.push(criteria);
    this.paging.push(paging);
    if (this.fail) throw new Error('database down');

    const items =
      criteria.department === '69' || criteria.communeIds?.includes('69123')
        ? [
            {
              id: 'group-lyon',
              name: 'GA Lyon',
              countryCode: 'FR',
              departmentCode: '69',
              departmentName: 'Rhône',
              communeId: '69123',
              communeName: 'Lyon',
              latitude: 45.764,
              longitude: 4.8357,
              calendar: { path: '/calendar.ics' as const, params: { group: 'group-lyon' } },
            },
          ]
        : [];

    return {
      items,
      total: items.length,
      limit: paging.limit,
      offset: paging.offset,
      referenceVersion: criteria.referenceVersion,
    };
  }
}

const resolver = {
  resolve: async (names: readonly string[]) => ({
    inseeCodes: names.map((name) => (name.toLowerCase() === 'lyon' ? '69123' : '99999')),
    diagnostics: [],
  }),
  resolveEpcis: async (ids: readonly string[]) => ({
    inseeCodes: ids.includes('200054781') ? ['69123'] : [],
    diagnostics: ids.includes('200054781')
      ? []
      : [
          {
            code: 'epci_invalid',
            field: 'epci',
            message: `EPCI "${ids[0]}" is not active or does not exist`,
            severity: 'error' as const,
          },
        ],
  }),
};

const apps: NestFastifyApplication[] = [];

async function buildAppWith(reader: GroupListingReader): Promise<NestFastifyApplication> {
  const app = await buildApp({
    datasetRepository: {
      getCurrent: async () => ({
        scopeId: 'group-1',
        revision: 1,
        generatedAt: new Date().toISOString(),
        events: [],
      }),
    },
    groupListing: reader,
    groupAreaResolver: resolver,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('GET /groups', () => {
  it('answers with the groups of a department and the contract headers', async () => {
    const app = await buildAppWith(new StubReader());

    const response = await app.inject({ method: 'GET', url: '/groups?department=69' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.json()).toEqual({
      items: [
        {
          id: 'group-lyon',
          name: 'GA Lyon',
          countryCode: 'FR',
          departmentCode: '69',
          departmentName: 'Rhône',
          communeId: '69123',
          communeName: 'Lyon',
          latitude: 45.764,
          longitude: 4.8357,
          calendar: { path: '/calendar.ics', params: { group: 'group-lyon' } },
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
      referenceVersion: VERSION,
    });
  });

  it('answers an area holding no group with an empty, valid listing', async () => {
    const app = await buildAppWith(new StubReader());

    const response = await app.inject({ method: 'GET', url: '/groups?department=01' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ items: [], total: 0, referenceVersion: VERSION });
  });

  it('exposes identity, name and a usable calendar reference only', async () => {
    const app = await buildAppWith(new StubReader());

    const response = await app.inject({ method: 'GET', url: '/groups?department=69' });
    const item = response.json().items[0] as Record<string, unknown>;

    expect(Object.keys(item).sort()).toEqual([
      'calendar',
      'communeId',
      'communeName',
      'countryCode',
      'departmentCode',
      'departmentName',
      'id',
      'latitude',
      'longitude',
      'name',
    ]);
    expect(item['name']).not.toBe('');
    expect((item['calendar'] as { params: { group: string } }).params.group).toBe(item['id']);
  });

  it('rejects a request that names no area', async () => {
    const app = await buildAppWith(new StubReader());

    const response = await app.inject({ method: 'GET', url: '/groups?limit=10' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid group area filter',
      diagnostics: [{ code: 'area_missing' }],
    });
  });

  it('rejects a criterion the catalogue read cannot apply', async () => {
    const app = await buildAppWith(new StubReader());

    const response = await app.inject({ method: 'GET', url: '/groups?department=69&lat=45.7' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      diagnostics: [{ code: 'filter_parameter_unsupported', field: 'lat' }],
    });
  });

  it('answers 503 when the data source is unavailable', async () => {
    const reader = new StubReader();
    reader.fail = true;
    const app = await buildAppWith(reader);

    const response = await app.inject({ method: 'GET', url: '/groups?department=69' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'group storage unavailable' });
  });

  it('answers 503 when no reference version is active', async () => {
    const reader = new StubReader();
    reader.findActiveVersion = async () => null;
    const app = await buildAppWith(reader);

    const response = await app.inject({ method: 'GET', url: '/groups?department=69' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      diagnostics: [{ code: 'reference_unavailable' }],
    });
  });
});

class ValidatingReader extends StubReader {
  public async validateArea(
    _version: string,
    identifiers: { readonly department?: string; readonly communeIds?: readonly string[] },
  ) {
    if (identifiers.department === '99') {
      return [
        {
          code: 'department_invalid',
          field: 'department',
          message: 'department "99" is not in the active geographic reference',
          severity: 'error' as const,
        },
      ];
    }
    const unknown = identifiers.communeIds?.find((code) => code === '99999');
    return unknown === undefined
      ? []
      : [
          {
            code: 'commune_invalid',
            field: 'insee_commune',
            message: `commune "${unknown}" is not in the active geographic reference`,
            severity: 'error' as const,
          },
        ];
  }
}

describe('GET /groups area boundary', () => {
  it('rejects a department the active reference does not know', async () => {
    const app = await buildAppWith(new ValidatingReader());

    const response = await app.inject({ method: 'GET', url: '/groups?department=99' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      diagnostics: [{ code: 'department_invalid', field: 'department' }],
    });
  });

  it('rejects an INSEE code the active reference does not know', async () => {
    const app = await buildAppWith(new ValidatingReader());

    const response = await app.inject({ method: 'GET', url: '/groups?insee_commune=99999' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      diagnostics: [{ code: 'commune_invalid', field: 'insee_commune' }],
    });
  });

  it('resolves a commune name to the commune dimension', async () => {
    const reader = new StubReader();
    const app = await buildAppWith(reader);

    const response = await app.inject({ method: 'GET', url: '/groups?commune_name=Lyon' });

    expect(response.statusCode).toBe(200);
    expect(reader.queries[0]).toMatchObject({ communeIds: ['69123'], referenceVersion: VERSION });
  });

  it('resolves an EPCI to its member communes', async () => {
    const reader = new StubReader();
    const app = await buildAppWith(reader);

    const response = await app.inject({ method: 'GET', url: '/groups?epci=200054781' });

    expect(response.statusCode).toBe(200);
    expect(reader.queries[0]).toMatchObject({ communeIds: ['69123'] });
  });

  it('rejects an EPCI identifier the reference does not know', async () => {
    const app = await buildAppWith(new StubReader());

    const response = await app.inject({ method: 'GET', url: '/groups?epci=999' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ diagnostics: [{ code: 'epci_invalid' }] });
  });

  it('answers 503 when EPCI membership cannot be resolved', async () => {
    const app = await buildApp({
      datasetRepository: {
        getCurrent: async () => ({
          scopeId: 'group-1',
          revision: 1,
          generatedAt: new Date().toISOString(),
          events: [],
        }),
      },
      groupListing: new StubReader(),
      groupAreaResolver: {
        resolve: async () => ({ inseeCodes: [], diagnostics: [] }),
        resolveEpcis: async () => ({
          inseeCodes: [],
          diagnostics: [
            {
              code: 'epci_membership_incomplete',
              field: 'epci',
              message: 'epci has no usable commune membership',
              severity: 'error' as const,
            },
          ],
        }),
      },
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/groups?epci=200054781' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      diagnostics: [{ code: 'epci_membership_incomplete' }],
    });
  });
});

describe('GET /groups paging', () => {
  it('defaults to the documented page size and offset', async () => {
    const reader = new StubReader();
    const app = await buildAppWith(reader);

    await app.inject({ method: 'GET', url: '/groups?department=69' });

    expect(reader.paging[0]).toEqual({ limit: 50, offset: 0 });
  });

  it('accepts the page-size boundaries', async () => {
    const app = await buildAppWith(new StubReader());

    const smallest = await app.inject({ method: 'GET', url: '/groups?department=69&limit=1' });
    const largest = await app.inject({ method: 'GET', url: '/groups?department=69&limit=200' });

    expect(smallest.json()).toMatchObject({ limit: 1 });
    expect(largest.json()).toMatchObject({ limit: 200 });
  });

  it('rejects a page size outside the supported range', async () => {
    const app = await buildAppWith(new StubReader());

    for (const limit of ['0', '201', 'abc']) {
      const response = await app.inject({
        method: 'GET',
        url: `/groups?department=69&limit=${limit}`,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ diagnostics: [{ code: 'limit_invalid' }] });
    }
  });

  it('rejects a negative offset', async () => {
    const app = await buildAppWith(new StubReader());

    const response = await app.inject({ method: 'GET', url: '/groups?department=69&offset=-1' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ diagnostics: [{ code: 'offset_invalid' }] });
  });

  it('echoes the effective paging values', async () => {
    const app = await buildAppWith(new StubReader());

    const response = await app.inject({
      method: 'GET',
      url: '/groups?department=69&limit=5&offset=10',
    });

    expect(response.json()).toMatchObject({ limit: 5, offset: 10 });
  });
});
