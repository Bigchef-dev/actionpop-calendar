import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { PostgresEventQuery } from '../../packages/core/src/persistence/postgres-event-query.js';
import type { PublishedEvent } from '../../packages/core/src/models/event.interface.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_geographic_filter' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);
const query = new PostgresEventQuery(harness.prisma);

beforeEach(async () => {
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.groupScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

function event(
  sourceEventId: string,
  geography: NonNullable<PublishedEvent['geography']>,
  eventType?: string,
): PublishedEvent {
  return {
    id: sourceEventId,
    sourceEventId,
    name: `Event ${sourceEventId}`,
    startTime: '2026-09-24T10:00:00+02:00',
    endTime: '2026-09-24T11:00:00+02:00',
    location: null,
    contentHash: `hash-${sourceEventId}`,
    sequence: 0,
    geography,
    ...(eventType === undefined ? {} : { eventType }),
  };
}

const lyonTractage = event(
  'lyon-tractage',
  {
    geographicStatus: 'resolved',
    countryCode: 'FR',
    departmentCode: '69',
    communeId: '69123',
    diagnostics: [],
  },
  'tractage',
);
const lyonBoitage = event(
  'lyon-boitage',
  {
    geographicStatus: 'resolved',
    countryCode: 'FR',
    departmentCode: '69',
    communeId: '69123',
    diagnostics: [],
  },
  'boitage',
);
const villeurbanne = event(
  'villeurbanne-tractage',
  {
    geographicStatus: 'resolved',
    countryCode: 'FR',
    departmentCode: '69',
    communeId: '69266',
    diagnostics: [],
  },
  'tractage',
);
const paris = event(
  'paris-tractage',
  {
    geographicStatus: 'resolved',
    countryCode: 'FR',
    departmentCode: '75',
    communeId: '75101',
    diagnostics: [],
  },
  'tractage',
);
const national = event('national-event', { geographicStatus: 'national', diagnostics: [] });

async function seed(): Promise<void> {
  await repository.saveCurrent({
    scopeId: 'group-1',
    revision: 1,
    generatedAt: '2026-10-28T00:00:00.000Z',
    events: [lyonTractage, lyonBoitage, villeurbanne, paris, national],
    status: 'complete',
  });
}

describe('geographic filtering', () => {
  it('applies one criterion at a time', async () => {
    await seed();
    expect(
      (await query.list({ department: '69' })).items.map((row) => row.sourceEventId).sort(),
    ).toEqual(['lyon-boitage', 'lyon-tractage', 'villeurbanne-tractage']);
    expect((await query.list({ commune: '69123' })).total).toBe(2);
    expect((await query.list({ country: 'FR' })).total).toBe(4);
    expect(
      (await query.list({ eventType: 'boitage' })).items.map((row) => row.sourceEventId),
    ).toEqual(['lyon-boitage']);
  });

  it('intersects every supplied criterion', async () => {
    await seed();
    const result = await query.list({
      country: 'FR',
      department: '69',
      commune: '69123',
      eventType: 'tractage',
    });
    expect(result.items.map((row) => row.sourceEventId)).toEqual(['lyon-tractage']);
    expect(result.total).toBe(1);
  });

  it('returns an empty result for a non-matching second criterion', async () => {
    await seed();
    expect((await query.list({ department: '69', commune: '75101' })).items).toEqual([]);
    expect((await query.list({ department: '75', eventType: 'boitage' })).items).toEqual([]);
  });

  it('never returns duplicates for a multi-criteria match', async () => {
    await seed();
    const result = await query.list({ country: 'FR', department: '69', commune: '69123' });
    const ids = result.items.map((row) => row.sourceEventId);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it('exposes the documented response shape', async () => {
    await seed();
    const result = await query.list({ commune: '69123' });
    expect(result.items[0]).toEqual({
      sourceEventId: 'lyon-boitage',
      eventType: 'boitage',
      countryCode: 'FR',
      departmentCode: '69',
      communeId: '69123',
      geographicStatus: 'resolved',
      referenceVersion: null,
    });
  });

  it('does not match a national event by any geographic criterion', async () => {
    await seed();
    for (const filter of [{ country: 'FR' }, { department: '69' }, { commune: '69123' }] as const) {
      expect((await query.list(filter)).items.map((row) => row.sourceEventId)).not.toContain(
        'national-event',
      );
    }
  });
});
