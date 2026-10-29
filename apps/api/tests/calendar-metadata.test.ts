import { describe, expect, it } from 'vitest';

import { FilteredCalendarService, type CalendarEvent, type MetadataLevel } from '@actionpop/core';

import { buildApp } from '../src/server.js';

const EVENT: CalendarEvent = {
  sourceEventId: 'event-1',
  summary: 'Tractage Lyon 3e',
  description: null,
  startTime: new Date('2026-11-03T09:00:00.000Z'),
  endTime: new Date('2026-11-03T11:00:00.000Z'),
  sequence: 2,
  updatedAt: new Date('2026-10-28T21:00:00.000Z'),
  lastSeenPeriod: '2026-10-28T21:00Z',
  eventType: 'tractage',
  sourceUrl: 'https://example.test/events/event-1',
  geography: {
    status: 'resolved',
    countryCode: 'FR',
    departmentCode: '69',
    communeId: '69123',
    referenceVersion: 'communes-test',
    rawDepartmentCode: '69',
    rawCommuneName: 'Lyon',
    diagnostics: [
      {
        code: 'commune_ambiguous',
        field: 'location.commune.name',
        message: 'two communes match',
        severity: 'warning',
      },
    ],
  },
  location: {
    fullAddress: '12 rue de la République, 69003 Lyon',
    shortAddress: null,
    address1: null,
    city: 'Lyon',
    zip: '69003',
  },
  coordinates: { latitude: '45.76', longitude: '4.85' },
  groupIds: ['group-1', 'group-2'],
};

async function fetchCalendar(
  options: {
    level?: MetadataLevel;
    disabledFamilies?: readonly (
      'identity' | 'classification' | 'provenance' | 'geography' | 'diagnostics' | 'raw_source'
    )[];
    maxGroupsPerEvent?: number;
  } = {},
) {
  const service = new FilteredCalendarService(
    { listCalendarEvents: async () => ({ events: [EVENT], truncated: false }) },
    {
      lookbackDays: 30,
      lookaheadDays: 90,
      maxEntries: 100,
      metadata: {
        level: options.level ?? 'standard',
        disabledFamilies: options.disabledFamilies ?? [],
        maxGroupsPerEvent: options.maxGroupsPerEvent ?? 5,
      },
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
    calendarSettings: {
      enabled: true,
      lookbackDays: 30,
      lookaheadDays: 90,
      maxEntries: 100,
      revalidationSeconds: 900,
      metadataLevel: options.level ?? 'standard',
    },
  });

  try {
    const response = await server.inject({ method: 'GET', url: '/calendar.ics' });
    return response.body;
  } finally {
    await server.close();
  }
}

describe('calendar metadata over HTTP', () => {
  it('emits no experimental property at the off level but keeps standard ones', async () => {
    const body = await fetchCalendar({ level: 'off' });

    expect(body).not.toContain('X-ACTIONPOP-');
    expect(body).toContain('LOCATION:');
    expect(body).toContain('URL:');
    expect(body).toContain('CATEGORIES:tractage');
    expect(body).toContain('GEO:45.760000;4.850000');
  });

  it('emits the identity family only at the identity level', async () => {
    const body = await fetchCalendar({ level: 'identity' });

    expect(body).toContain('X-ACTIONPOP-EVENT-ID:event-1');
    expect(body).not.toContain('X-ACTIONPOP-EVENT-TYPE');
  });

  it('emits classification and provenance at the default level', async () => {
    const body = await fetchCalendar();

    expect(body).toContain('X-ACTIONPOP-EVENT-TYPE:tractage');
    expect(body).toContain('X-ACTIONPOP-SOURCE-URL:https://example.test/events/event-1');
    expect(body.match(/X-ACTIONPOP-GROUP:/g)).toHaveLength(2);
    expect(body).not.toContain('X-ACTIONPOP-GEO-STATUS');
  });

  it('emits geography and diagnostics at the full level', async () => {
    const body = await fetchCalendar({ level: 'full' });

    expect(body).toContain('X-ACTIONPOP-GEO-STATUS:resolved');
    expect(body).toContain('X-ACTIONPOP-DEPARTMENT:69');
    expect(body).toContain('X-ACTIONPOP-INSEE-COMMUNE:69123');
    expect(body).toContain('X-ACTIONPOP-GEO-DIAGNOSTIC;CODE=commune_ambiguous');
  });

  it('honours a disabled family at the full level', async () => {
    const body = await fetchCalendar({ level: 'full', disabledFamilies: ['geography'] });

    expect(body).not.toContain('X-ACTIONPOP-GEO-STATUS');
    expect(body).toContain('X-ACTIONPOP-EVENT-ID');
  });

  it('caps the group properties per entry', async () => {
    const body = await fetchCalendar({ maxGroupsPerEvent: 1 });

    expect(body.match(/X-ACTIONPOP-GROUP:/g)).toHaveLength(1);
  });

  it('stays importable when metadata is present', async () => {
    const body = await fetchCalendar({ level: 'full' });

    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(body.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const line of body.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});
