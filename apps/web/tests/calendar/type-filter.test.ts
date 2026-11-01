import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../src/types';
import {
  availableTypes,
  feedPeriod,
  filterByType,
  formatPeriod,
} from '../../src/features/calendar/utils/type-filter';

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

describe('feedPeriod', () => {
  it('reports the first and last start of the displayed events', () => {
    const period = feedPeriod(events);
    expect(period?.from.toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(period?.to.toISOString().slice(0, 10)).toBe('2026-11-13');
    expect(feedPeriod([])).toBeNull();
  });
});

describe('formatPeriod', () => {
  it('reads a single-day period as one date', () => {
    const day = new Date('2026-11-02T10:00:00Z');
    expect(formatPeriod({ from: day, to: new Date('2026-11-02T18:00:00Z') })).toBe(
      'Le 2 novembre 2026',
    );
  });

  it('reads a multi-day period as a range', () => {
    expect(
      formatPeriod({
        from: new Date('2026-11-02T10:00:00Z'),
        to: new Date('2026-12-04T10:00:00Z'),
      }),
    ).toContain('Du 2 novembre 2026 au 4 décembre 2026');
  });

  it('is empty without a period', () => {
    expect(formatPeriod(null)).toBe('');
  });
});
