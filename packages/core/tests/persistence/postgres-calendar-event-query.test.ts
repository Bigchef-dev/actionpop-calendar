import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type {
  CalendarEventCriteria,
  CalendarWindow,
} from '../../src/calendar-filters/calendar-event.js';
import { PostgresCalendarEventQuery } from '../../src/persistence/postgres-calendar-event-query.js';

const WINDOW: CalendarWindow = {
  startUtc: '2026-10-01T00:00:00.000Z',
  endUtc: '2026-12-31T00:00:00.000Z',
};

function eventRow(sourceEventId: string, communeId: string) {
  return {
    sourceEventId,
    summary: sourceEventId,
    description: null,
    startTime: new Date('2026-11-05T18:00:00.000Z'),
    endTime: new Date('2026-11-05T20:00:00.000Z'),
    sequence: 1,
    status: 'ACTIVE',
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    lastSeenPeriod: '2026-11-01',
    eventType: 'tractage',
    sourceUrl: null,
    geographicStatus: 'resolved',
    countryCode: 'FR',
    departmentCode: '01',
    communeId,
    referenceVersion: 'geo-2026',
    rawDepartmentCode: null,
    rawCommuneName: null,
    geographicDiagnostics: [],
    location: null,
    groupLinks: [],
  };
}

function query(rows: ReturnType<typeof eventRow>[]) {
  const received: Array<{ where: Record<string, unknown> }> = [];
  const prisma = {
    eventRecord: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        received.push(args);
        return rows;
      },
    },
  };
  return {
    reader: new PostgresCalendarEventQuery(prisma as unknown as PrismaClient),
    received,
  };
}

describe('PostgresCalendarEventQuery with an EPCI scope', () => {
  it('filters on every resolved member commune of the territory', async () => {
    const { reader, received } = query([
      eventRow('event-1', '01001'),
      eventRow('event-2', '01002'),
    ]);

    const criteria: CalendarEventCriteria = { communeIds: ['01001', '01002'] };
    const result = await reader.listCalendarEvents(criteria, WINDOW, 50);

    const where = received[0]?.where as { OR: Array<{ communeId: { in: string[] } }> };
    expect(where.OR[0]?.communeId.in).toEqual(['01001', '01002']);
    expect(result.events.map((event) => event.sourceEventId)).toEqual(['event-1', 'event-2']);
  });

  it('keeps each matching event once, keyed by its stable identity', async () => {
    const { reader } = query([eventRow('event-1', '01001')]);

    const result = await reader.listCalendarEvents({ communeIds: ['01001', '01002'] }, WINDOW, 50);

    expect(result.events.map((event) => event.sourceEventId)).toEqual(['event-1']);
    expect(result.truncated).toBe(false);
  });

  it('combines EPCI communes with event-type and group criteria using AND', async () => {
    const { reader, received } = query([]);

    await reader.listCalendarEvents(
      { communeIds: ['01001'], eventTypes: ['tractage'], groupIds: ['group-1'] },
      WINDOW,
      50,
    );

    expect(received[0]?.where).toMatchObject({
      eventType: { in: ['tractage'] },
      groupLinks: { some: { scopeId: { in: ['group-1'] } } },
    });
  });

  it('reports truncation instead of silently shortening the calendar', async () => {
    const { reader } = query([eventRow('event-1', '01001'), eventRow('event-2', '01001')]);

    const result = await reader.listCalendarEvents({ communeIds: ['01001'] }, WINDOW, 1);

    expect(result.events).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});
