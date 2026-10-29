import type { CalendarEvent } from '../calendar-filters/calendar-event.js';
import { formatCalendarLocation } from './calendar-location.js';
import { escapeText, formatContentLine, type ContentLine } from './ical-writer.js';

const COORDINATE_DECIMALS = 6;

/**
 * Standard calendar properties derived from the event's own published data.
 * They are emitted at every metadata level because they are what a calendar
 * client displays natively.
 */
export function buildStandardProperties(event: CalendarEvent): ContentLine[] {
  const lines: ContentLine[] = [];

  const location = formatCalendarLocation(event.location);
  if (location !== undefined) lines.push({ name: 'LOCATION', value: escapeText(location) });

  if (event.sourceUrl !== null && event.sourceUrl !== '') {
    lines.push({ name: 'URL', value: escapeText(event.sourceUrl) });
  }

  if (event.eventType !== null && event.eventType !== '') {
    lines.push({ name: 'CATEGORIES', value: escapeText(event.eventType) });
  }

  if (event.coordinates !== null) {
    const latitude = Number(event.coordinates.latitude);
    const longitude = Number(event.coordinates.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      lines.push({
        name: 'GEO',
        value: `${latitude.toFixed(COORDINATE_DECIMALS)};${longitude.toFixed(COORDINATE_DECIMALS)}`,
      });
    }
  }

  return lines;
}

export function formatStandardProperties(event: CalendarEvent): string[] {
  return buildStandardProperties(event).map((line) => formatContentLine(line));
}
