import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../src/types';
import { availableTypes, filterByType } from '../../src/features/calendar/utils/type-filter';

function eventAt(id: string, type: string | null, day: number): CalendarEvent {
  return {
    id,
    summary: id,
    description: '',
    start: new Date(Date.UTC(2026, 10, day, 18)),
    end: null,
    allDay: false,
    status: 'CONFIRMED',
    eventType: type,
    sourceUrl: null,
    location: null,
    coordinates: null,
    metadata: [],
  };
}

const events = [
  eventAt('a', 'tractage', 10),
  eventAt('b', 'tractage', 12),
  eventAt('c', 'collage', 11),
  eventAt('d', null, 13),
];

describe('filterByType', () => {
  it('keeps every event when nothing is selected', () => {
    expect(filterByType(events, [])).toHaveLength(4);
  });

  it('keeps only the selected types, and hides untyped events', () => {
    expect(filterByType(events, ['tractage']).map((event) => event.id)).toEqual(['a', 'b']);
    expect(filterByType(events, ['tractage', 'collage']).map((event) => event.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('matches nothing for an unknown slug', () => {
    expect(filterByType(events, ['inconnu'])).toEqual([]);
  });
});

describe('availableTypes', () => {
  it('counts the types present, most frequent first', () => {
    expect(availableTypes(events)).toEqual([
      { slug: 'tractage', count: 2 },
      { slug: 'collage', count: 1 },
    ]);
  });
});
