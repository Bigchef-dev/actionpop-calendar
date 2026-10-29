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

describe('Action Populaire geographic raw fields', () => {
  const base = {
    id: 'event-geo',
    name: 'Tractage',
    startTime: '2026-09-24T10:00:00+02:00',
    endTime: '2026-09-24T11:00:00+02:00',
    timezone: 'Europe/Paris',
  };

  it('retains departement, commune name and presentation labels as strings', () => {
    const parsed = validateActionPopulaireEvent({
      ...base,
      location: {
        ...location,
        departement: '75',
        commune: { name: 'Paris', nameOf: 'de Paris' },
        shortAddress: '1 Main Street, Paris',
        shortLocation: 'Town hall',
      },
    });

    expect(parsed.location.departement).toBe('75');
    expect(parsed.location.commune?.name).toBe('Paris');
    expect(parsed.location.shortAddress).toBe('1 Main Street, Paris');
    expect(parsed.location.shortLocation).toBe('Town hall');
  });

  it('preserves leading zeroes and alphanumeric department codes', () => {
    expect(
      validateActionPopulaireEvent({ ...base, location: { ...location, departement: '01' } })
        .location.departement,
    ).toBe('01');
    expect(
      validateActionPopulaireEvent({ ...base, location: { ...location, departement: '2A' } })
        .location.departement,
    ).toBe('2A');
  });

  it('treats blank or empty geographic fields as not stated', () => {
    const parsed = validateActionPopulaireEvent({
      ...base,
      location: { ...location, departement: '', country: '', commune: null },
    });

    expect(parsed.location.departement).toBeUndefined();
    expect(parsed.location.country).toBeUndefined();
    expect(parsed.location.commune).toBeUndefined();
  });
});

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
    expect(
      validateGroupCatalogue([{ id: 'group-1', name: 'Group', is_active: true, subtype: null }])[0]
        ?.subtype,
    ).toBeNull();
    expect(
      validateActionPopulaireEvent({
        id: 'online-event',
        name: 'Online meeting',
        startTime: '2026-09-24T10:00:00+02:00',
        endTime: '2026-09-24T11:00:00+02:00',
        timezone: 'Europe/Berlin',
        location: {},
      }).timezone,
    ).toBe('Europe/Berlin');
  });

  it('tolerates group entries that state a blank identifier or no name', () => {
    const parsed = validateActionPopulaireEvent({
      id: 'event-groups',
      name: 'Meeting',
      startTime: '2026-09-24T10:00:00+02:00',
      endTime: '2026-09-24T11:00:00+02:00',
      timezone: 'Europe/Paris',
      location,
      groups: [{ id: '  ', name: 'Blank' }, { id: ' group-1 ' }, { id: 'group-2', name: '  ' }],
    });

    expect(parsed.groups).toEqual([
      { id: '', name: 'Blank' },
      { id: 'group-1' },
      { id: 'group-2' },
    ]);
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
      validateGroupCatalogue([
        { id: 'group-1', name: 'Group', is_active: true, subtypes: ['invalid'] },
      ]),
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
