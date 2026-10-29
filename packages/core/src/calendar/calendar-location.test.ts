import { describe, expect, it } from 'vitest';

import { formatCalendarLocation } from './calendar-location.js';

describe('formatCalendarLocation', () => {
  it('prefixes the place name to the postal address', () => {
    expect(
      formatCalendarLocation({
        name: "L'UBU",
        address1: '1 Rue Saint-Hélier, 35000 Rennes',
        zip: '35000',
        city: 'Rennes',
      }),
    ).toBe("L'UBU, 1 Rue Saint-Hélier, 35000 Rennes");
  });

  it('composes the street, postal code and city when the street does not state them', () => {
    expect(
      formatCalendarLocation({
        name: 'Centre ville Cazères',
        address1: 'Place des Martyrs de la Résistance',
        zip: '31220',
        city: 'Cazères',
      }),
    ).toBe('Centre ville Cazères, Place des Martyrs de la Résistance, 31220 Cazères');
  });

  it('does not repeat the locality already present in the street line', () => {
    const formatted = formatCalendarLocation({
      address1: '1 Rue Saint-Hélier, 35000 Rennes',
      zip: '35000',
      city: 'Rennes',
    });

    expect(formatted).toBe('1 Rue Saint-Hélier, 35000 Rennes');
    expect(formatted?.match(/35000/g)).toHaveLength(1);
    expect(formatted?.match(/Rennes/g)).toHaveLength(1);
  });

  it('includes the second address line before the locality', () => {
    expect(
      formatCalendarLocation({
        address1: 'Bâtiment B',
        address2: '12 rue de la République',
        zip: '69003',
        city: 'Lyon',
      }),
    ).toBe('Bâtiment B, 12 rue de la République, 69003 Lyon');
  });

  it('drops a place name that only repeats the city', () => {
    expect(
      formatCalendarLocation({
        name: 'Montbazon',
        address1: 'Parking gare',
        zip: '37250',
        city: 'Montbazon',
      }),
    ).toBe('Parking gare, 37250 Montbazon');
  });

  it('drops a place name already contained in the address', () => {
    expect(
      formatCalendarLocation({
        name: 'Mairie',
        address1: 'Mairie, 12 rue de la République',
        city: 'Lyon',
      }),
    ).toBe('Mairie, 12 rue de la République, Lyon');
  });

  it('ignores a map link stored instead of a street line', () => {
    expect(
      formatCalendarLocation({
        name: 'Rond point Gogney, N4',
        address1: 'https://maps.app.goo.gl/UTQH75h5WQxJFT4q7',
        zip: '54450',
        city: 'Blamont',
      }),
    ).toBe('Rond point Gogney, N4, 54450 Blamont');
  });

  it('keeps only the street line when no locality is stated', () => {
    expect(formatCalendarLocation({ address1: '12 rue de la République' })).toBe(
      '12 rue de la République',
    );
  });

  it('keeps only the locality when no street line is stated', () => {
    expect(formatCalendarLocation({ zip: '69003', city: 'Lyon' })).toBe('69003 Lyon');
    expect(formatCalendarLocation({ city: 'Lyon' })).toBe('Lyon');
  });

  it('prefers the composed address over the short address', () => {
    expect(
      formatCalendarLocation({
        address1: '12 rue de la République',
        zip: '69003',
        city: 'Lyon',
        shortAddress: 'Mairie du 3e, 69003, Lyon',
      }),
    ).toBe('12 rue de la République, 69003 Lyon');
  });

  it('falls back to the short address, then the full address, then the name', () => {
    expect(formatCalendarLocation({ shortAddress: 'Mairie du 3e' })).toBe('Mairie du 3e');
    expect(formatCalendarLocation({ fullAddress: '12 rue X\n69003 Lyon\nFrance' })).toBe(
      '12 rue X, 69003 Lyon, France',
    );
    expect(formatCalendarLocation({ address: '12 rue X\n69003 Lyon' })).toBe(
      '12 rue X, 69003 Lyon',
    );
    expect(formatCalendarLocation({ name: 'Parc de la Tête d’Or' })).toBe('Parc de la Tête d’Or');
  });

  it('drops a repeated line when flattening a full address', () => {
    expect(
      formatCalendarLocation({ fullAddress: '1 Rue Saint-Hélier, 35000 Rennes\n35000 Rennes' }),
    ).toBe('1 Rue Saint-Hélier, 35000 Rennes');
  });

  it('collapses repeated and surrounding whitespace', () => {
    expect(formatCalendarLocation({ address1: '  12   rue  X ', city: ' Lyon ' })).toBe(
      '12 rue X, Lyon',
    );
  });

  it('returns undefined for an absent or empty location', () => {
    expect(formatCalendarLocation(null)).toBeUndefined();
    expect(formatCalendarLocation(undefined)).toBeUndefined();
    expect(formatCalendarLocation({})).toBeUndefined();
    expect(
      formatCalendarLocation({ address1: '  ', city: null, shortAddress: '' }),
    ).toBeUndefined();
  });
});
