import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../calendar-filters/calendar-event.js';
import { formatStandardProperties } from './standard-properties.js';

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    sourceEventId: 'event-1',
    summary: 'Tractage',
    description: null,
    startTime: new Date('2026-11-03T09:00:00.000Z'),
    endTime: new Date('2026-11-03T11:00:00.000Z'),
    sequence: 0,
    updatedAt: new Date('2026-10-28T21:00:00.000Z'),
    lastSeenPeriod: null,
    eventType: 'tractage',
    sourceUrl: 'https://example.test/events/event-1',
    geography: null,
    location: {
      name: 'Mairie du 3e',
      fullAddress: '12 rue de la République\n69003 Lyon',
      shortAddress: 'Mairie du 3e, Lyon',
      address1: '12 rue de la République',
      address2: null,
      city: 'Lyon',
      zip: '69003',
    },
    coordinates: { latitude: '45.76', longitude: '4.85' },
    groupIds: [],
    ...overrides,
  };
}

describe('standard properties', () => {
  it('emits LOCATION, URL, CATEGORIES and GEO', () => {
    expect(formatStandardProperties(event())).toEqual([
      'LOCATION:Mairie du 3e\\, 12 rue de la République\\, 69003 Lyon',
      'URL:https://example.test/events/event-1',
      'CATEGORIES:tractage',
      'GEO:45.760000;4.850000',
    ]);
  });

  it('prefers the short address when no full address is stated', () => {
    const lines = formatStandardProperties(
      event({
        location: {
          name: 'Salle des fêtes',
          fullAddress: null,
          shortAddress: 'Salle des fêtes',
          address1: null,
          address2: null,
          city: null,
          zip: null,
        },
      }),
    );

    expect(lines[0]).toBe('LOCATION:Salle des fêtes');
  });

  it('falls back to the city with its postal code', () => {
    const lines = formatStandardProperties(
      event({
        location: {
          name: null,
          fullAddress: null,
          shortAddress: null,
          address1: null,
          address2: null,
          city: 'Lyon',
          zip: '69003',
        },
      }),
    );

    expect(lines[0]).toBe('LOCATION:69003 Lyon');
  });

  it('omits a property whose data is absent', () => {
    const lines = formatStandardProperties(
      event({
        eventType: null,
        sourceUrl: null,
        coordinates: null,
        location: null,
      }),
    );

    expect(lines).toEqual([]);
  });

  it('omits GEO when the coordinates are not numeric', () => {
    const lines = formatStandardProperties(
      event({ coordinates: { latitude: 'not-a-number', longitude: '4.85' } }),
    );

    expect(lines.some((line) => line.startsWith('GEO:'))).toBe(false);
  });
});
