import { describe, expect, it } from 'vitest';

import { buildIcalFeed } from './ical-feed.js';

describe('iCalendar feed', () => {
  it('serializes stable event identity, revisions, escaping, and CRLF lines', () => {
    const feed = buildIcalFeed({
      scopeId: 'group-1',
      revision: 4,
      generatedAt: '2026-09-30T12:00:00.000Z',
      events: [
        {
          sourceEventId: 'event-1',
          summary: 'Réunion; équipe',
          description: 'Line one\nLine two',
          startTime: '2026-10-01T10:00:00+02:00',
          endTime: '2026-10-01T11:00:00+02:00',
          sequence: 2,
          location: 'Paris, FR',
        },
      ],
    });

    expect(feed.revision).toBe('group-1-4');
    expect(feed.body).toContain('UID:event-1@actionpop-calendar');
    expect(feed.body).toContain('SEQUENCE:2');
    expect(feed.body).toContain('SUMMARY:Réunion\\; équipe');
    expect(feed.body).toContain('DESCRIPTION:Line one\\nLine two');
    expect(feed.body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(feed.body).toMatch(/END:VCALENDAR\r\n$/);
  });
});
