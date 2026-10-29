import type { CalendarEvent } from '../calendar-filters/calendar-event.js';
import { buildMetadataLines, type MetadataSettings } from './ical-metadata.js';
import { escapeText, formatUtcInstant, joinLines } from './ical-writer.js';
import { formatStandardProperties } from './standard-properties.js';

export interface FilteredCalendarInput {
  readonly events: readonly CalendarEvent[];
  readonly generatedAt: Date;
  readonly metadata?: MetadataSettings;
}

export interface FilteredCalendarDocument {
  readonly body: string;
  readonly groupsTruncated: boolean;
}

export function buildFilteredCalendar(input: FilteredCalendarInput): string {
  return buildFilteredCalendarDocument(input).body;
}

/**
 * Builds the RFC 5545 document for one filtered request. Standard properties are
 * always emitted; experimental metadata follows the configured level and the
 * disabled families.
 */
export function buildFilteredCalendarDocument(
  input: FilteredCalendarInput,
): FilteredCalendarDocument {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ActionPop Calendar//EN',
    'CALSCALE:GREGORIAN',
  ];

  const stamp = formatUtcInstant(input.generatedAt);
  let groupsTruncated = false;

  for (const event of input.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(event.sourceEventId)}@actionpop-calendar`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `DTSTART:${formatUtcInstant(event.startTime)}`,
      `DTEND:${formatUtcInstant(event.endTime)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `SEQUENCE:${event.sequence}`,
    );
    if (event.description !== null && event.description !== '') {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }

    lines.push(...formatStandardProperties(event));

    if (input.metadata !== undefined) {
      const emission = buildMetadataLines(event, input.metadata);
      lines.push(...emission.lines);
      groupsTruncated = groupsTruncated || emission.groupsTruncated;
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return { body: joinLines(lines), groupsTruncated };
}
