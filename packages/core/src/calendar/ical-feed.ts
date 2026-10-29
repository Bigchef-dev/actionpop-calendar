import { PublishedEvent, PublishedGroupSnapshot } from '../models/event.interface.js';
import { escapeText, formatUtcInstant, joinLines } from './ical-writer.js';

export type CalendarFeedInput = Exclude<PublishedGroupSnapshot, 'eventIds'> & {
  events: PublishedEvent[];
};

export interface CalendarFeed {
  revision: string;
  body: string;
}

export function buildIcalFeed(input: CalendarFeedInput): CalendarFeed {
  const revision = `${input.scopeId}-${input.revision}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ActionPop Calendar//EN',
    'CALSCALE:GREGORIAN',
  ];

  for (const event of input.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(event.sourceEventId)}@actionpop-calendar`,
      `DTSTAMP:${formatUtcInstant(input.generatedAt)}`,
      `LAST-MODIFIED:${formatUtcInstant(input.generatedAt)}`,
      `DTSTART:${formatUtcInstant(event.startTime)}`,
      `DTEND:${formatUtcInstant(event.endTime)}`,
      `SUMMARY:${escapeText(event.name)}`,
      `SEQUENCE:${event.sequence}`,
    );
    if (event.description !== undefined) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return { revision, body: joinLines(lines) };
}
