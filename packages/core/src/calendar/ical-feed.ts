export interface CalendarFeedEvent {
  sourceEventId: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  sequence: number;
  location?: string;
}

export interface CalendarFeedInput {
  scopeId: string;
  revision: number;
  generatedAt: string;
  events: CalendarFeedEvent[];
}

export interface CalendarFeed {
  revision: string;
  body: string;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([,;])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');
}

function toUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('calendar date is invalid');
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
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
      `DTSTAMP:${toUtc(input.generatedAt)}`,
      `LAST-MODIFIED:${toUtc(input.generatedAt)}`,
      `DTSTART:${toUtc(event.startTime)}`,
      `DTEND:${toUtc(event.endTime)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `SEQUENCE:${event.sequence}`,
    );
    if (event.description !== undefined) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location !== undefined) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return { revision, body: `${lines.join('\r\n')}\r\n` };
}
