import { describe, expect, it } from 'vitest';

import {
  deliveryKindOf,
  filterCardinality,
  filterSamples,
  subjectKindOf,
} from './calendar-metrics.js';

describe('calendar metrics', () => {
  it('derives the territory family without keeping the identifier', () => {
    expect(subjectKindOf({ insee_commune: '35238' })).toBe('commune');
    expect(subjectKindOf({ epci: '243500139' })).toBe('epci');
    expect(subjectKindOf({ department: '35' })).toBe('department');
    expect(subjectKindOf({ group: 'ga-rennes' })).toBe('group');
    expect(subjectKindOf({ insee_commune: '35238', event_type: 'tractage' })).toBe('commune');
    expect(subjectKindOf({ insee_commune: '35238', epci: '243500139' })).toBe('multi');
    expect(subjectKindOf({})).toBe('none');
    expect(subjectKindOf({ insee_commune: '  ' })).toBe('none');
  });

  it('classifies the delivery in one of four bounded kinds', () => {
    expect(deliveryKindOf(200)).toBe('first');
    expect(deliveryKindOf(304)).toBe('revalidated');
    expect(deliveryKindOf(400)).toBe('rejected');
    expect(deliveryKindOf(405)).toBe('rejected');
    expect(deliveryKindOf(503)).toBe('unavailable');
  });

  it('records filter cardinality instead of filter values', () => {
    expect(filterCardinality(0)).toBe('none');
    expect(filterCardinality(1)).toBe('one');
    expect(filterCardinality(5)).toBe('few');
    expect(filterCardinality(6)).toBe('many');

    expect(filterSamples({})).toEqual([]);
    expect(filterSamples({ event_type: 'tractage,collage' })).toEqual([
      { filter: 'type', cardinality: 'few' },
    ]);
    expect(filterSamples({ event_type: 'tractage', group: 'a,b,c,d,e,f' })).toEqual([
      { filter: 'type', cardinality: 'one' },
      { filter: 'group', cardinality: 'many' },
    ]);
  });
});
