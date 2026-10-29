import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../calendar-filters/calendar-event.js';
import { buildFilteredCalendar } from './filtered-ical.js';

function calendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    sourceEventId: 'event-1',
    summary: 'Tractage Lyon 3e',
    description: null,
    startTime: new Date('2026-11-03T09:00:00.000Z'),
    endTime: new Date('2026-11-03T11:00:00.000Z'),
    sequence: 2,
    updatedAt: new Date('2026-10-28T21:00:00.000Z'),
    lastSeenPeriod: '2026-10-28T21:00Z',
    eventType: 'tractage',
    sourceUrl: null,
    geography: null,
    location: null,
    coordinates: null,
    groupIds: [],
    ...overrides,
  };
}

describe('filtered calendar document', () => {
  it('frames the document and emits one entry per event', () => {
    const document = buildFilteredCalendar({
      events: [calendarEvent(), calendarEvent({ sourceEventId: 'event-2' })],
      generatedAt: new Date('2026-10-28T21:00:00.000Z'),
    });

    expect(document.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(document.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(document.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(document).toContain('VERSION:2.0');
    expect(document).toContain('PRODID:-//ActionPop Calendar//EN');
    expect(document).toContain('CALSCALE:GREGORIAN');
  });

  it('emits a stable identity and UTC instants', () => {
    const document = buildFilteredCalendar({
      events: [calendarEvent()],
      generatedAt: new Date('2026-10-28T21:00:00.000Z'),
    });

    expect(document).toContain('UID:event-1@actionpop-calendar');
    expect(document).toContain('DTSTAMP:20261028T210000Z');
    expect(document).toContain('LAST-MODIFIED:20261028T210000Z');
    expect(document).toContain('DTSTART:20261103T090000Z');
    expect(document).toContain('DTEND:20261103T110000Z');
    expect(document).toContain('SEQUENCE:2');
  });

  it('escapes the summary and emits an optional description', () => {
    const document = buildFilteredCalendar({
      events: [calendarEvent({ summary: 'Réunion; équipe', description: 'Line one\nLine two' })],
      generatedAt: new Date('2026-10-28T21:00:00.000Z'),
    });

    expect(document).toContain('SUMMARY:Réunion\\; équipe');
    expect(document).toContain('DESCRIPTION:Line one\\nLine two');
  });

  it('produces a valid empty calendar', () => {
    const document = buildFilteredCalendar({
      events: [],
      generatedAt: new Date('2026-10-28T21:00:00.000Z'),
    });

    expect(document).not.toContain('BEGIN:VEVENT');
    expect(document.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
