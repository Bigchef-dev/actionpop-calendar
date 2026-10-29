import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { computeCalendarWindow } from '../../packages/core/src/calendar-filters/calendar-window.js';
import { startIntegrationPostgres } from './postgres-setup.js';
import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { PostgresCalendarEventQuery } from '../../packages/core/src/persistence/postgres-calendar-event-query.js';

const harness = await startIntegrationPostgres({ schema: 'test_calendar_event_query' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);
const query = new PostgresCalendarEventQuery(harness.prisma);

beforeEach(async () => {
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.groupScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

const requestInstant = new Date('2026-10-15T12:00:00.000Z');
const window = computeCalendarWindow({ lookbackDays: 30, lookaheadDays: 90 }, requestInstant);

function event(
  sourceEventId: string,
  options: {
    startTime?: string;
    endTime?: string;
    departmentCode?: string;
    communeId?: string;
    eventType?: string;
    groups?: string[];
  } = {},
) {
  return {
    id: sourceEventId,
    sourceEventId,
    name: `Event ${sourceEventId}`,
    startTime: options.startTime ?? '2026-10-20T10:00:00+02:00',
    endTime: options.endTime ?? '2026-10-20T11:00:00+02:00',
    location: null,
    contentHash: `hash-${sourceEventId}`,
    sequence: 0,
    eventType: options.eventType ?? 'tractage',
    groups: (options.groups ?? []).map((id) => ({ id })),
    geography: {
      geographicStatus: 'resolved' as const,
      diagnostics: [],
      countryCode: 'FR',
      departmentCode: options.departmentCode ?? '69',
      communeId: options.communeId ?? '69123',
      referenceVersion: 'communes-test',
    },
  };
}

describe('PostgresCalendarEventQuery', () => {
  it('returns one row per event even when the same event is observed by several listings', async () => {
    const shared = event('event-shared', { groups: ['group-a', 'group-b', 'group-c'] });
    for (const scopeId of ['group-a', 'group-b', 'group-c']) {
      await repository.saveCurrent({
        scopeId,
        revision: 1,
        generatedAt: '2026-10-15T12:00:00.000Z',
        events: [shared],
        status: 'complete',
      });
    }

    const result = await query.listCalendarEvents({}, window, 100);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.groupIds).toEqual(['group-a', 'group-b', 'group-c']);
    expect(result.truncated).toBe(false);
  });

  it('exposes a group once when two listings state the same organizer', async () => {
    const shared = event('event-shared', { groups: ['group-shared'] });
    for (const scopeId of ['listing-1', 'listing-2']) {
      await repository.saveCurrent({
        scopeId,
        revision: 1,
        generatedAt: '2026-10-15T12:00:00.000Z',
        events: [shared],
        status: 'complete',
      });
    }

    const links = await harness.prisma.eventGroupLink.findMany({
      where: { eventId: 'event-shared' },
    });
    expect(links).toHaveLength(2);

    const result = await query.listCalendarEvents({}, window, 100);
    expect(result.events[0]?.groupIds).toEqual(['group-shared']);
  });

  it('applies the overlap window and keeps identifiers as strings', async () => {
    await repository.saveCurrent({
      scopeId: 'group-a',
      revision: 1,
      generatedAt: '2026-10-15T12:00:00.000Z',
      status: 'complete',
      events: [
        event('event-inside', { departmentCode: '01', communeId: '01001' }),
        event('event-before', {
          startTime: '2026-08-01T10:00:00+02:00',
          endTime: '2026-08-01T11:00:00+02:00',
        }),
        event('event-after', {
          startTime: '2027-06-01T10:00:00+02:00',
          endTime: '2027-06-01T11:00:00+02:00',
        }),
      ],
    });

    const result = await query.listCalendarEvents({}, window, 100);

    expect(result.events.map((item) => item.sourceEventId)).toEqual(['event-inside']);
    expect(result.events[0]?.geography?.departmentCode).toBe('01');
    expect(result.events[0]?.geography?.communeId).toBe('01001');
  });

  it('filters by every supplied criterion with AND semantics', async () => {
    await repository.saveCurrent({
      scopeId: 'group-a',
      revision: 1,
      generatedAt: '2026-10-15T12:00:00.000Z',
      status: 'complete',
      events: [
        event('event-69123-tractage', { communeId: '69123', eventType: 'tractage' }),
        event('event-69124-tractage', { communeId: '69124', eventType: 'tractage' }),
        event('event-69123-boitage', { communeId: '69123', eventType: 'boitage' }),
      ],
    });

    const result = await query.listCalendarEvents(
      { department: '69', communeIds: ['69123', '69124'], eventTypes: ['tractage'] },
      window,
      100,
    );

    expect(result.events.map((item) => item.sourceEventId)).toEqual([
      'event-69123-tractage',
      'event-69124-tractage',
    ]);
  });

  it('reports truncation instead of returning more than the ceiling', async () => {
    await repository.saveCurrent({
      scopeId: 'group-a',
      revision: 1,
      generatedAt: '2026-10-15T12:00:00.000Z',
      status: 'complete',
      events: [event('event-1'), event('event-2'), event('event-3')],
    });

    const result = await query.listCalendarEvents({}, window, 2);

    expect(result.events).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('returns an empty result when nothing matches', async () => {
    const result = await query.listCalendarEvents({ department: '99' }, window, 100);

    expect(result.events).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});
