import { describe, expect, it } from 'vitest';

import { parseCalendar } from '../../src/features/calendar/utils/ical-mapping';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//ActionPop Calendar//EN',
  'BEGIN:VEVENT',
  'UID:event-1',
  'DTSTART:20261110T180000Z',
  'DTEND:20261110T200000Z',
  'SUMMARY:Tractage Lyon',
  'DESCRIPTION:Distribution de tracts',
  'LOCATION:Place Bellecour\\, Lyon',
  'CATEGORIES:tractage',
  'URL:https://actionpopulaire.fr/evenements/event-1/',
  'GEO:45.7578;4.832',
  'X-ACTIONPOP-EVENT-ID:event-1',
  'X-ACTIONPOP-EVENT-TYPE:tractage',
  'X-ACTIONPOP-SOURCE-URL:https://actionpopulaire.fr/evenements/event-1/',
  'X-ACTIONPOP-GROUP:npa-lyon',
  'X-ACTIONPOP-GROUP:attac-69',
  'X-ACTIONPOP-GEO-DIAGNOSTIC;CODE=commune_ambiguous;SEVERITY=warning:two matches',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-2',
  'DTSTART:20261112T100000Z',
  'SUMMARY:Réunion annulée',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-3',
  'DTSTART:20261115T090000Z',
  'SUMMARY:Marché',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-3',
  'RECURRENCE-ID:20261115T090000Z',
  'DTSTART:20261115T090000Z',
  'SUMMARY:Marché',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Sans identifiant',
  'DTSTART:20261116T090000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseCalendar', () => {
  const parsed = parseCalendar(ICS);

  it('maps identity, times, type and place', () => {
    const event = parsed.events.find((item) => item.id === 'event-1');
    expect(event).toBeDefined();
    expect(event?.summary).toBe('Tractage Lyon');
    expect(event?.eventType).toBe('tractage');
    expect(event?.location).toContain('Bellecour');
    expect(event?.status).toBe('CONFIRMED');
    expect(event?.coordinates).toEqual({ latitude: 45.7578, longitude: 4.832 });
  });

  it('captures every published property, keeping its parameters', () => {
    const event = parsed.events.find((item) => item.id === 'event-1');
    const names = event?.metadata.map((entry) => entry.name) ?? [];
    expect(names).toContain('X-ACTIONPOP-EVENT-TYPE');
    expect(names.filter((name) => name === 'X-ACTIONPOP-GROUP')).toHaveLength(2);
    const diagnostic = event?.metadata.find((entry) => entry.name === 'X-ACTIONPOP-GEO-DIAGNOSTIC');
    expect(diagnostic?.parameters).toEqual({ CODE: 'commune_ambiguous', SEVERITY: 'warning' });
  });

  it('keeps a cancelled event visible instead of dropping it', () => {
    const cancelled = parsed.events.find((item) => item.id === 'event-2');
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('removes the occurrence replaced by a cancelled exception', () => {
    expect(parsed.events.filter((item) => item.id === 'event-3')).toHaveLength(0);
  });

  it('drops a component without identity and counts it', () => {
    expect(parsed.dropped).toBe(1);
  });

  it('never throws on a malformed document', () => {
    expect(parseCalendar('not a calendar')).toEqual({ events: [], dropped: 0 });
  });
});
