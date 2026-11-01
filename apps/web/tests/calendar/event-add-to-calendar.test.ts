import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../src/types';
import {
  actionPopulaireUrl,
  googleCalendarUrl,
  mapsUrl,
  toIcsDocument,
} from '../../src/features/calendar/utils/event-links';

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    summary: 'Tractage, place Bellecour',
    description: 'Distribution de tracts',
    start: new Date('2026-11-10T18:00:00Z'),
    end: new Date('2026-11-10T20:00:00Z'),
    allDay: false,
    status: 'CONFIRMED',
    eventType: 'tractage',
    sourceUrl: 'https://actionpopulaire.fr/evenements/event-1/',
    location: 'Place Bellecour, Lyon',
    coordinates: null,
    metadata: [],
    ...overrides,
  };
}

describe('googleCalendarUrl', () => {
  it('carries the title, dates, place and description', () => {
    const url = new URL(googleCalendarUrl(event()));
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Tractage, place Bellecour');
    expect(url.searchParams.get('dates')).toBe('20261110T180000Z/20261110T200000Z');
    expect(url.searchParams.get('location')).toBe('Place Bellecour, Lyon');
  });

  it('defaults to a one-hour event when no end is published', () => {
    const url = new URL(googleCalendarUrl(event({ end: null })));
    expect(url.searchParams.get('dates')).toBe('20261110T180000Z/20261110T190000Z');
  });

  it('omits the place when the event has none', () => {
    const url = new URL(googleCalendarUrl(event({ location: null })));
    expect(url.searchParams.get('location')).toBeNull();
  });
});

describe('toIcsDocument', () => {
  it('produces a valid single-event document', () => {
    const document = toIcsDocument(event());
    expect(document).toContain('BEGIN:VCALENDAR');
    expect(document).toContain('BEGIN:VEVENT');
    expect(document).toContain('UID:event-1');
    expect(document).toContain('DTSTART:20261110T180000Z');
    expect(document).toContain('SUMMARY:Tractage\\, place Bellecour');
    expect(document).toContain('END:VCALENDAR');
  });

  it('uses date values for an all-day event', () => {
    const document = toIcsDocument(event({ allDay: true }));
    expect(document).toContain('DTSTART;VALUE=DATE:20261110');
  });
});

describe('links', () => {
  it('builds a map search for the place', () => {
    expect(mapsUrl('Place Bellecour, Lyon')).toContain('Place%20Bellecour%2C%20Lyon');
  });

  it('points to the Action Populaire page carrying the contact', () => {
    expect(actionPopulaireUrl(event())).toBe('https://actionpopulaire.fr/evenements/event-1/');
    expect(actionPopulaireUrl(event({ sourceUrl: null }))).toBeNull();
  });
});
