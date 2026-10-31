import { describe, expect, it } from 'vitest';

import { PayloadValidationError } from '../operations/errors.js';
import { validateMapEventListing } from './map-listing.js';

const valid = {
  id: 'event-1',
  name: 'Meeting',
  coordinates: { type: 'Point', coordinates: [2.35, 48.85] },
  date: 'le 23 octobre 2027 à 16:00 (Europe/Paris)',
  link: 'https://actionpopulaire.fr/evenements/carte/event-1/',
  start_time: '2027-10-23T16:00:00+02:00',
  end_time: '2027-10-23T18:00:00+02:00',
  subtype: 16,
};

describe('validateMapEventListing', () => {
  it('accepts a complete listing and keeps only the summary fields', () => {
    const result = validateMapEventListing([valid, { ...valid, id: 'event-2' }]);

    expect(result.summaries).toHaveLength(2);
    expect(result.summaries[0]).toEqual(valid);
    expect(result.rejected).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.droppedHints).toEqual({
      name: 0,
      coordinates: 0,
      date: 0,
      link: 0,
      start_time: 0,
      end_time: 0,
      subtype: 0,
    });
  });

  it('rejects a non-array response instead of returning an empty listing', () => {
    expect(() => validateMapEventListing({})).toThrow(PayloadValidationError);
    expect(() => validateMapEventListing(null)).toThrow(/expected an array/);
  });

  it('accepts an empty array as a complete empty listing', () => {
    expect(validateMapEventListing([]).summaries).toEqual([]);
  });

  it.each([undefined, null, 42, '', '   ', {}])(
    'rejects an entry without an identity: %s',
    (id) => {
      const result = validateMapEventListing([{ ...valid, id }]);

      expect(result.summaries).toEqual([]);
      expect(result.rejected).toBe(1);
    },
  );

  it('keeps a valid identity when every optional hint is invalid', () => {
    const result = validateMapEventListing([
      {
        id: 'event-1',
        name: '',
        coordinates: { type: 'Point', coordinates: [200, 95] },
        date: '',
        link: 'not-a-url',
        start_time: 'yesterday',
        end_time: 'tomorrow',
        subtype: 'sixteen',
      },
    ]);

    expect(result.summaries).toEqual([{ id: 'event-1' }]);
    expect(result.rejected).toBe(0);
    expect(result.droppedHints).toEqual({
      name: 1,
      coordinates: 1,
      date: 1,
      link: 1,
      start_time: 1,
      end_time: 1,
      subtype: 1,
    });
  });

  it('drops an end time that precedes its start time', () => {
    const result = validateMapEventListing([
      {
        ...valid,
        start_time: '2027-10-23T18:00:00+02:00',
        end_time: '2027-10-23T16:00:00+02:00',
      },
    ]);

    expect(result.summaries[0]).not.toHaveProperty('end_time');
    expect(result.droppedHints.end_time).toBe(1);
  });

  it('collapses duplicate identities and counts them', () => {
    const result = validateMapEventListing([valid, { ...valid, name: 'Later duplicate' }]);

    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]?.name).toBe('Meeting');
    expect(result.duplicates).toBe(1);
  });
});
