import { describe, expect, it } from 'vitest';

import {
  validateActionPopulaireEvent,
  validateGroupCatalogue,
} from './action-populaire-schemas.js';

const location = {
  name: 'Town hall',
  address1: '1 Main Street',
  address2: null,
  zip: '75001',
  city: 'Paris',
  country: 'FR',
  coordinates: { type: 'Point', coordinates: [2.35, 48.85] },
};

describe('Action Populaire schemas', () => {
  it('accepts valid events and group catalogues', () => {
    expect(
      validateActionPopulaireEvent({
        id: 'event-1',
        name: 'Meeting',
        startTime: '2026-09-24T10:00:00+02:00',
        endTime: '2026-09-24T11:00:00+02:00',
        timezone: 'Europe/Paris',
        location,
        groups: [{ id: 'group-1', name: 'Group' }],
      }).id,
    ).toBe('event-1');
    expect(
      validateGroupCatalogue([{ id: 'group-1', name: 'Group', is_active: true }])[0]?.is_active,
    ).toBe(true);
  });

  it('rejects out-of-range GeoJSON coordinates and malformed payloads', () => {
    expect(() =>
      validateActionPopulaireEvent({
        id: 'event-1',
        name: 'Meeting',
        startTime: '2026-09-24T10:00:00+02:00',
        endTime: '2026-09-24T11:00:00+02:00',
        timezone: 'Europe/Paris',
        location: { ...location, coordinates: { type: 'Point', coordinates: [181, 48] } },
      }),
    ).toThrow(/coordinates/i);
    expect(() => validateGroupCatalogue([{ id: 'group-1' }])).toThrow(/name|is_active/);
    expect(() =>
      validateGroupCatalogue([{ id: 'group-1', name: 'Group', is_active: true, subtypes: ['invalid'] }]),
    ).toThrow(/subtypes/);
    expect(() =>
      validateActionPopulaireEvent({
        id: 'event-1',
        name: 'Meeting',
        startTime: '2026-09-24T10:00:00',
        endTime: '2026-09-24T11:00:00+02:00',
        timezone: 'Europe/Paris',
        location,
      }),
    ).toThrow(/ISO 8601|timezone/i);
  });
});