import { describe, expect, it } from 'vitest';

import { formatCalendarLocation } from '@actionpop/core';

import { toIncomingEvent } from '../src/main.js';

const payload = {
  id: 'event-1',
  name: 'Tractage Lyon 3e',
  startTime: '2026-10-20T10:00:00+02:00',
  endTime: '2026-10-20T11:00:00+02:00',
  location: {
    name: 'Mairie du 3e',
    address: '12 rue de la République\n69003 Lyon',
    address1: '12 rue de la République',
    address2: 'Bâtiment B',
    zip: '69003',
    city: 'Lyon',
    departement: '69',
    country: 'FR',
    shortAddress: 'Mairie du 3e, Lyon',
    shortLocation: 'Mairie',
    coordinates: { type: 'Point' as const, coordinates: [4.85, 45.76] as [number, number] },
  },
  subtype: { label: 'tractage' },
};

const geography = {
  geographicStatus: 'resolved' as const,
  diagnostics: [],
  countryCode: 'FR',
  departmentCode: '69',
  communeId: '69123',
};

describe('worker event location', () => {
  it('carries every address field into the published event', () => {
    const incoming = toIncomingEvent(payload, geography);

    expect(incoming.location).toMatchObject({
      name: 'Mairie du 3e',
      address: '12 rue de la République\n69003 Lyon',
      address1: '12 rue de la République',
      address2: 'Bâtiment B',
      zip: '69003',
      city: 'Lyon',
      shortAddress: 'Mairie du 3e, Lyon',
      shortLocation: 'Mairie',
    });
    expect(incoming.location?.coordinates?.coordinates).toEqual([4.85, 45.76]);
  });

  it('produces a single-line LOCATION from the carried fields', () => {
    const incoming = toIncomingEvent(payload, geography);

    expect(formatCalendarLocation(incoming.location)).toBe(
      'Mairie du 3e, 12 rue de la République, Bâtiment B, 69003 Lyon',
    );
  });

  it('keeps a null location when the source states none', () => {
    const incoming = toIncomingEvent({ ...payload, location: null }, geography);

    expect(incoming.location).toBeNull();
    expect(formatCalendarLocation(incoming.location)).toBeUndefined();
  });
});
