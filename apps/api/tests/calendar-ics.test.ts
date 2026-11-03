import { describe, expect, it } from 'vitest';

import {
  FilteredCalendarService,
  type CalendarBuildResult,
  type CalendarEventCriteria,
  type CalendarWindow,
} from '@actionpop/core';

import { buildApp } from '../src/server.js';
import type { CalendarIcsSettings } from '../src/controllers/calendar-ics.controller.js';

const SETTINGS: CalendarIcsSettings = {
  enabled: true,
  lookbackDays: 30,
  lookaheadDays: 90,
  maxEntries: 1000,
  revalidationSeconds: 900,
};

async function buildTestApp(
  options: {
    build?: (query: Record<string, string | undefined>) => Promise<CalendarBuildResult>;
    settings?: Partial<CalendarIcsSettings>;
  } = {},
) {
  return await buildApp({
    datasetRepository: {
      getCurrent: async () => ({
        scopeId: 'group-1',
        revision: 1,
        generatedAt: new Date().toISOString(),
        events: [],
      }),
    },
    calendarService: {
      build:
        options.build ??
        (async () => ({
          ok: true,
          body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n',
          truncated: false,
          criteria: {},
        })),
    },
    calendarSettings: { ...SETTINGS, ...options.settings },
  });
}

describe('GET /calendar.ics', () => {
  it('forwards department and event type and answers a calendar document', async () => {
    const received: Array<Record<string, string | undefined>> = [];
    const server = await buildTestApp({
      build: async (query) => {
        received.push(query);
        return {
          ok: true,
          body: [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:event-1@actionpop-calendar',
            'END:VEVENT',
            'END:VCALENDAR',
            '',
          ].join('\r\n'),
          truncated: false,
          criteria: {},
        };
      },
    });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/calendar.ics?department=69&event_type=tractage',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.headers['content-type']).toContain('charset=utf-8');
      expect(received[0]).toMatchObject({ department: '69', event_type: 'tractage' });
      expect(response.body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it('emits each matching event exactly once', async () => {
    const server = await buildTestApp({
      build: async () => ({
        ok: true,
        body: 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:e@actionpop-calendar\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
        truncated: false,
        criteria: {},
      }),
    });

    try {
      const response = await server.inject({ method: 'GET', url: '/calendar.ics' });
      expect(response.body.match(/UID:e@actionpop-calendar/g)).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it('exposes a revalidation tag driven by the produced body', async () => {
    const server = await buildTestApp();

    try {
      const first = await server.inject({ method: 'GET', url: '/calendar.ics' });
      expect(first.headers.etag).toBeDefined();
      expect(first.headers['cache-control']).toBe('public, max-age=900');

      const second = await server.inject({
        method: 'GET',
        url: '/calendar.ics',
        headers: { 'if-none-match': String(first.headers.etag) },
      });
      expect(second.statusCode).toBe(304);
    } finally {
      await server.close();
    }
  });
});

describe('CalendarService composition', () => {
  it('passes the resolved criteria and the configured window to the query', async () => {
    const { FilteredCalendarService } = await import('@actionpop/core');
    const calls: Array<{ criteria: CalendarEventCriteria; window: CalendarWindow }> = [];

    const service = new FilteredCalendarService(
      {
        listCalendarEvents: async (criteria, window) => {
          calls.push({ criteria, window });
          return { events: [], truncated: false };
        },
      },
      { lookbackDays: 30, lookaheadDays: 90, maxEntries: 10 },
    );

    const result = await service.build(
      { department: '69', event_type: 'tractage,boitage' },
      { requestInstant: new Date('2026-10-15T12:00:00.000Z') },
    );

    expect(result.ok).toBe(true);
    expect(calls[0]?.criteria).toEqual({ department: '69', eventTypes: ['tractage', 'boitage'] });
    expect(calls[0]?.window.startUtc.toISOString()).toBe('2026-09-15T12:00:00.000Z');
    expect(calls[0]?.window.endUtc.toISOString()).toBe('2027-01-13T12:00:00.000Z');
  });
});

describe('commune selection', () => {
  it('accepts a comma-separated INSEE list and forwards it as a union', async () => {
    const received: CalendarEventCriteria[] = [];
    const { FilteredCalendarService } = await import('@actionpop/core');

    const service = new FilteredCalendarService(
      {
        listCalendarEvents: async (criteria) => {
          received.push(criteria);
          return { events: [], truncated: false };
        },
      },
      { lookbackDays: 30, lookaheadDays: 90, maxEntries: 10 },
    );

    const result = await service.build({ insee_commune: '69123,69124' });

    expect(result.ok).toBe(true);
    expect(received[0]?.communeIds).toEqual(['69123', '69124']);
  });

  it('unions commune names and INSEE codes into one commune dimension', async () => {
    const received: CalendarEventCriteria[] = [];
    const { FilteredCalendarService } = await import('@actionpop/core');

    const service = new FilteredCalendarService(
      {
        listCalendarEvents: async (criteria) => {
          received.push(criteria);
          return { events: [], truncated: false };
        },
      },
      { lookbackDays: 30, lookaheadDays: 90, maxEntries: 10 },
      {
        resolve: async () => ({ inseeCodes: ['69123'], diagnostics: [] }),
      },
    );

    const result = await service.build({
      commune_name: 'Lyon',
      insee_commune: '69266',
      department: '69',
    });

    expect(result.ok).toBe(true);
    expect(received[0]?.communeIds).toEqual(['69123', '69266']);
    expect(received[0]?.department).toBe('69');
  });

  it('rejects an ambiguous commune name with its diagnostics', async () => {
    const { FilteredCalendarService } = await import('@actionpop/core');
    const service = new FilteredCalendarService(
      { listCalendarEvents: async () => ({ events: [], truncated: false }) },
      { lookbackDays: 30, lookaheadDays: 90, maxEntries: 10 },
      {
        resolve: async () => ({
          inseeCodes: [],
          diagnostics: [
            {
              code: 'commune_name_ambiguous',
              field: 'commune_name',
              message:
                '"Sainte-Colombe" matches 27567, 69162; narrow the request with department or insee_commune',
              severity: 'error' as const,
            },
          ],
        }),
      },
    );

    const server = await buildApp({
      datasetRepository: {
        getCurrent: async () => ({
          scopeId: 'group-1',
          revision: 1,
          generatedAt: new Date().toISOString(),
          events: [],
        }),
      },
      calendarService: service,
      calendarSettings: SETTINGS,
    });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/calendar.ics?commune_name=Sainte-Colombe',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.diagnostics[0]).toMatchObject({
        code: 'commune_name_ambiguous',
        field: 'commune_name',
      });
    } finally {
      await server.close();
    }
  });
});

describe('response coverage', () => {
  it('returns a valid empty calendar when nothing matches', async () => {
    const server = await buildTestApp({
      build: async () => ({
        ok: true,
        body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n',
        truncated: false,
        criteria: {},
      }),
    });

    try {
      const response = await server.inject({ method: 'GET', url: '/calendar.ics?department=99' });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('BEGIN:VEVENT');
      expect(response.body.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('rejects a write method as read-only', async () => {
    const server = await buildTestApp();
    try {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
        const response = await server.inject({ method, url: '/calendar.ics' });
        expect(response.statusCode).toBe(405);
        expect(JSON.parse(response.body)).toMatchObject({ error: 'read-only calendar' });
      }
    } finally {
      await server.close();
    }
  });

  it('reports storage failure as unavailable', async () => {
    const server = await buildTestApp({
      build: async () => {
        throw new Error('database unreachable');
      },
    });

    try {
      const response = await server.inject({ method: 'GET', url: '/calendar.ics' });
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toMatchObject({ error: 'event storage unavailable' });
    } finally {
      await server.close();
    }
  });

  it('answers 404 when the calendar route is disabled', async () => {
    const server = await buildTestApp({ settings: { enabled: false } });

    try {
      const response = await server.inject({ method: 'GET', url: '/calendar.ics' });
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toMatchObject({ error: 'calendar disabled' });

      const feed = await server.inject({ method: 'GET', url: '/feed/group-1' });
      expect(feed.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });
});

describe('filter diagnostics over HTTP', () => {
  async function inject(query: string) {
    const { FilteredCalendarService } = await import('@actionpop/core');
    const service = new FilteredCalendarService(
      { listCalendarEvents: async () => ({ events: [], truncated: false }) },
      { lookbackDays: 30, lookaheadDays: 90, maxEntries: 10 },
    );
    const server = await buildApp({
      datasetRepository: {
        getCurrent: async () => ({
          scopeId: 'group-1',
          revision: 1,
          generatedAt: new Date().toISOString(),
          events: [],
        }),
      },
      calendarService: service,
      calendarSettings: SETTINGS,
    });
    try {
      return await server.inject({ method: 'GET', url: `/calendar.ics?${query}` });
    } finally {
      await server.close();
    }
  }

  it.each([
    ['region=84', 'filter_parameter_unsupported'],
    ['epci=200046977', 'epci_unavailable'],
    ['lat=45.7', 'filter_parameter_unsupported'],
    ['page=2', 'filter_parameter_unknown'],
    ['country=France', 'filter_value_invalid'],
  ])('rejects %s with %s', async (query, code) => {
    const response = await inject(query);

    expect(response.statusCode).toBe(code === 'epci_unavailable' ? 503 : 400);
    expect(JSON.parse(response.body).diagnostics[0]).toMatchObject({ code });
  });
});

describe('GET /calendar.ics with an EPCI territory', () => {
  async function buildEpciApp(options: {
    inseeCodes?: readonly string[];
    diagnostics?: readonly { code: string; field: string; message: string; severity: 'error' }[];
    events?: readonly string[];
  } = {}) {
    const seen: CalendarEventCriteria[] = [];
    const service = new FilteredCalendarService(
      {
        listCalendarEvents: async (criteria) => {
          seen.push(criteria);
          return {
            events: (options.events ?? []).map((id) => ({
              sourceEventId: id,
              summary: id,
              description: null,
              startTime: '2026-11-05T18:00:00.000Z',
              endTime: '2026-11-05T20:00:00.000Z',
              sequence: 1,
              status: 'ACTIVE' as const,
              updatedAt: '2026-11-01T00:00:00.000Z',
              lastSeenPeriod: '2026-11-01',
              eventType: 'tractage',
              sourceUrl: null,
              geography: null,
              location: null,
              coordinates: null,
              groupIds: [],
            })),
            truncated: false,
          };
        },
      },
      { lookbackDays: 30, lookaheadDays: 90, maxEntries: 1000 },
      {
        resolve: async () => ({ inseeCodes: [], diagnostics: [] }),
        resolveEpcis: async () => ({
          inseeCodes: options.inseeCodes ?? [],
          diagnostics: options.diagnostics ?? [],
        }),
      },
    );
    const server = await buildTestApp({ build: (query) => service.build(query) });
    return { server, seen };
  }

  it('resolves a territory to its member communes and answers a calendar document', async () => {
    const { server, seen } = await buildEpciApp({
      inseeCodes: ['01001', '01002'],
      events: ['event-1', 'event-2'],
    });
    try {
      const response = await server.inject({
        method: 'GET',
        url: '/calendar.ics?epci=200000001',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('UID:event-1@actionpop-calendar');
      expect(seen[0]?.communeIds).toEqual(['01001', '01002']);
    } finally {
      await server.close();
    }
  });

  it('answers a valid empty feed when the territory has no event', async () => {
    const { server } = await buildEpciApp({ inseeCodes: ['01001'] });
    try {
      const response = await server.inject({
        method: 'GET',
        url: '/calendar.ics?epci=200000001',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('BEGIN:VCALENDAR');
      expect(response.body).not.toContain('BEGIN:VEVENT');
    } finally {
      await server.close();
    }
  });

  it.each([
    ['epci_invalid', 400],
    ['epci_membership_incomplete', 503],
    ['epci_unavailable', 503],
  ] as const)('answers %s with %i and no unrelated events', async (code, status) => {
    const { server, seen } = await buildEpciApp({
      diagnostics: [{ code, field: 'epci', message: 'unavailable', severity: 'error' }],
    });
    try {
      const response = await server.inject({
        method: 'GET',
        url: '/calendar.ics?epci=299999999',
      });

      expect(response.statusCode).toBe(status);
      expect(JSON.parse(response.body).diagnostics[0]).toMatchObject({ code });
      expect(seen).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('keeps the ETag and 304 behavior for a filtered territory link', async () => {
    const { server } = await buildEpciApp({ inseeCodes: ['01001'], events: ['event-1'] });
    try {
      const first = await server.inject({
        method: 'GET',
        url: '/calendar.ics?epci=200000001&event_type=tractage&group=group-1',
      });
      expect(first.statusCode).toBe(200);
      const etag = first.headers.etag;
      expect(etag).toBeDefined();

      const second = await server.inject({
        method: 'GET',
        url: '/calendar.ics?epci=200000001&event_type=tractage&group=group-1',
        headers: { 'if-none-match': String(etag) },
      });
      expect(second.statusCode).toBe(304);
    } finally {
      await server.close();
    }
  });
});
