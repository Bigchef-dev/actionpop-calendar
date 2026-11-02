import type { CalendarEvent } from '../../../types';
import { METADATA_EVENT_ID, metadataValue } from './metadata';

const ACTION_POPULAIRE = 'https://actionpopulaire.fr';

function compact(date: Date): string {
  return date.toISOString().replace(/-|:|\.\d{3}/g, '');
}

/** Google Calendar "add event" link for one event. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const start = compact(event.start);
  const end = compact(event.end ?? new Date(event.start.getTime() + 3_600_000));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.summary,
    dates: `${start}/${end}`,
    details: event.description,
    ...(event.location === null ? {} : { location: event.location }),
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

/** Map view of the event place. */
export function mapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/** Page of one action group. */
export function groupPageUrl(groupId: string): string {
  return `${ACTION_POPULAIRE}/groupes/${encodeURIComponent(groupId)}/`;
}

/**
 * Action Populaire page of the event, where the responsible person is reachable. The feed
 * publishes the canonical URL as a property; when it is absent the event identifier is enough
 * to rebuild it, so the call to action never points at a missing page.
 */
export function actionPopulaireUrl(event: CalendarEvent): string | null {
  if (event.sourceUrl !== null && event.sourceUrl !== '') return event.sourceUrl;
  const eventId = metadataValue(event.metadata, METADATA_EVENT_ID);
  return eventId === null ? null : `${ACTION_POPULAIRE}/evenements/${encodeURIComponent(eventId)}/`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** A single-event calendar document, so the visitor can import a stable copy. */
export function toIcsDocument(event: CalendarEvent): string {
  const end = event.end ?? new Date(event.start.getTime() + 3_600_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ActionPop Calendar//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}`,
    `DTSTAMP:${compact(new Date())}`,
    event.allDay
      ? `DTSTART;VALUE=DATE:${compact(event.start).slice(0, 8)}`
      : `DTSTART:${compact(event.start)}`,
    event.allDay ? `DTEND;VALUE=DATE:${compact(end).slice(0, 8)}` : `DTEND:${compact(end)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    ...(event.location === null ? [] : [`LOCATION:${escapeIcsText(event.location)}`]),
    `STATUS:${event.status}`,
    ...(event.sourceUrl === null ? [] : [`URL:${event.sourceUrl}`]),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
