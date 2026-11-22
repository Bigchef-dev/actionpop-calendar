import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/server.js';
import type { GeographicEventItem } from '../src/controllers/events.controller.js';

const oneEvent: GeographicEventItem = {
  sourceEventId: 'event-1',
  eventType: 'tractage',
  countryCode: 'FR',
  departmentCode: '01',
  communeId: '01001',
  geographicStatus: 'resolved',
  referenceVersion: 'communes-20261028-b81cad794b9c',
};

function buildTestApp(received: unknown[] = []) {
  return buildApp({
    datasetRepository: {
      getCurrent: async () => ({
        scopeId: 'group-1',
        revision: 1,
        generatedAt: new Date().toISOString(),
        events: [],
      }),
    },
    eventQuery: {
      list: async (filter) => {
        received.push(filter);
        return { items: [oneEvent], total: 1 };
      },
    },
    calendarService: {
      build: async () => ({
        ok: true,
        body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n',
        truncated: false,
        criteria: {},
      }),
    },
    calendarSettings: {
      enabled: true,
      lookbackDays: 30,
      lookaheadDays: 90,
      maxEntries: 1000,
      revalidationSeconds: 900,
    },
  });
}

describe('API reference', () => {
  it('serves the OpenAPI document and the Scalar page', async () => {
    const server = await buildTestApp();
    try {
      const document = await server.inject({ method: 'GET', url: '/openapi.json' });
      expect(document.statusCode).toBe(200);
      expect(document.headers['content-type']).toContain('application/json');

      const reference = await server.inject({ method: 'GET', url: '/reference' });
      expect(reference.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('documents every geographic filter parameter as a string with an example', async () => {
    const server = await buildTestApp();
    try {
      const document = await server.inject({ method: 'GET', url: '/openapi.json' });
      const params = JSON.parse(document.body).paths['/events'].get.parameters as Array<{
        name: string;
        schema: { type: string; example?: string; pattern?: string };
      }>;
      const byName = new Map(params.map((param) => [param.name, param]));

      expect([...byName.keys()].sort()).toEqual(['commune', 'country', 'department', 'event_type']);
      expect(byName.get('country')?.schema).toMatchObject({ type: 'string', example: 'FR' });
      expect(byName.get('department')?.schema).toMatchObject({ type: 'string', example: '01' });
      expect(byName.get('commune')?.schema).toMatchObject({ type: 'string', example: '01001' });
      expect(byName.get('event_type')?.schema).toMatchObject({
        type: 'string',
        example: 'tractage',
      });
    } finally {
      await server.close();
    }
  });

  it('states the AND semantics and keeps codes as strings in the document', async () => {
    const server = await buildTestApp();
    try {
      const document = await server.inject({ method: 'GET', url: '/openapi.json' });
      const body = JSON.parse(document.body);
      expect(body.paths['/events'].get.description).toContain('AND semantics');

      const schema = body.components.schemas.GeographicEventItemDto;
      expect(schema.properties.departmentCode).toMatchObject({ type: 'string', example: '01' });
      expect(schema.properties.communeId).toMatchObject({ type: 'string', example: '01001' });
      expect(schema.properties.countryCode).toMatchObject({ type: 'string', example: 'FR' });
    } finally {
      await server.close();
    }
  });

  it('returns the intersection and keeps every identifier a string', async () => {
    const received: unknown[] = [];
    const server = await buildTestApp(received);
    try {
      const response = await server.inject({
        method: 'GET',
        url: '/events?country=fr&department=01&commune=01001&event_type=tractage',
      });

      expect(response.statusCode).toBe(200);
      expect(received).toEqual([
        { country: 'FR', department: '01', commune: '01001', eventType: 'tractage' },
      ]);
      const body = JSON.parse(response.body);
      expect(body.items[0]).toMatchObject({ communeId: '01001', departmentCode: '01' });
      expect(body.total).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('rejects an unsupported or malformed parameter with its diagnostics', async () => {
    const server = await buildTestApp();
    try {
      const unsupported = await server.inject({ method: 'GET', url: '/events?region=84' });
      expect(unsupported.statusCode).toBe(400);
      expect(JSON.parse(unsupported.body).diagnostics[0]).toMatchObject({
        code: 'filter_parameter_unsupported',
        field: 'region',
      });

      const malformed = await server.inject({ method: 'GET', url: '/events?country=France' });
      expect(malformed.statusCode).toBe(400);
      expect(JSON.parse(malformed.body).diagnostics[0]).toMatchObject({
        code: 'filter_value_invalid',
        field: 'country',
      });
    } finally {
      await server.close();
    }
  });

  it('documents the calendar route, its parameters, semantics and response', async () => {
    const server = await buildTestApp();
    try {
      const document = await server.inject({ method: 'GET', url: '/openapi.json' });
      const operation = JSON.parse(document.body).paths['/calendar.ics'].get as {
        description: string;
        parameters: Array<{
          name: string;
          required: boolean;
          schema: { type: string; example?: string };
        }>;
        responses: Record<string, { description: string }>;
      };

      const byName = new Map(operation.parameters.map((param) => [param.name, param]));
      expect([...byName.keys()].sort()).toEqual([
        'commune_name',
        'country',
        'department',
        'epci',
        'event_type',
        'insee_commune',
      ]);
      expect(byName.get('country')?.schema).toMatchObject({ type: 'string', example: 'FR' });
      expect(byName.get('department')?.schema).toMatchObject({ type: 'string', example: '69' });
      expect(byName.get('commune_name')?.schema).toMatchObject({
        type: 'string',
        example: 'Lyon,Villeurbanne',
      });
      expect(byName.get('insee_commune')?.schema).toMatchObject({
        type: 'string',
        example: '69123,69124',
      });
      expect(byName.get('event_type')?.schema).toMatchObject({
        type: 'string',
        example: 'tractage',
      });
      for (const parameter of operation.parameters) {
        expect(parameter.required).toBe(false);
      }

      expect(operation.description).toContain('AND');
      expect(operation.description).toContain(
        'commune_name and insee_commune form one commune dimension',
      );
      expect(operation.description).toContain(
        'department=69&insee_commune=69123,69124&event_type=tractage',
      );
      expect(Object.keys(operation.responses).sort()).toEqual(['200', '304', '400', '405', '503']);
    } finally {
      await server.close();
    }
  });

  it('documents every metadata property name and the standard properties', async () => {
    const { METADATA_PREFIX, METADATA_PROPERTIES } = await import('@actionpop/core');
    const server = await buildTestApp();
    try {
      const document = await server.inject({ method: 'GET', url: '/openapi.json' });
      const description = JSON.parse(document.body).paths['/calendar.ics'].get
        .description as string;

      for (const property of METADATA_PROPERTIES) {
        expect(description).toContain(`${METADATA_PREFIX}${property.name}`);
      }
      for (const standard of ['LOCATION', 'URL', 'CATEGORIES', 'GEO']) {
        expect(description).toContain(standard);
      }
      expect(description).toContain('stable across updates');
    } finally {
      await server.close();
    }
  });
});
