import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { computeCalendarWindow } from '../../packages/core/src/calendar-filters/calendar-window.js';
import { buildFilteredCalendarDocument } from '../../packages/core/src/calendar/filtered-ical.js';
import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { PostgresCalendarEventQuery } from '../../packages/core/src/persistence/postgres-calendar-event-query.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_calendar_location' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);
const query = new PostgresCalendarEventQuery(harness.prisma);

beforeEach(async () => {
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.geoPoint.deleteMany();
  await harness.prisma.locationRecord.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

const window = computeCalendarWindow(
  { lookbackDays: 30, lookaheadDays: 90 },
  new Date('2026-10-15T12:00:00.000Z'),
);

function eventWithLocation(location: Record<string, unknown> | null) {
  return {
    id: 'event-1',
    sourceEventId: 'event-1',
    name: 'Tractage Lyon 3e',
    startTime: '2026-10-20T10:00:00+02:00',
    endTime: '2026-10-20T11:00:00+02:00',
    location,
    contentHash: 'hash-event-1',
    sequence: 0,
    eventType: 'tractage',
  };
}

async function save(location: Record<string, unknown> | null): Promise<void> {
  await repository.saveCurrent({
    scopeId: 'group-1',
    revision: 1,
    generatedAt: '2026-10-15T12:00:00.000Z',
    events: [eventWithLocation(location)],
    status: 'complete',
  });
}

describe('event location persistence', () => {
  it('stores the address and its coordinates for the event', async () => {
    await save({
      name: 'Mairie du 3e',
      address: '12 rue de la République\n69003 Lyon',
      address1: '12 rue de la République',
      address2: null,
      zip: '69003',
      city: 'Lyon',
      shortAddress: 'Mairie du 3e, Lyon',
      coordinates: { type: 'Point', coordinates: [4.85, 45.76] },
    });

    const record = await harness.prisma.eventRecord.findUnique({
      where: { sourceEventId: 'event-1' },
      include: { location: { include: { geoPoint: true } } },
    });

    expect(record?.locationId).toBe('event:event-1');
    expect(record?.location).toMatchObject({
      ownerType: 'EVENT',
      name: 'Mairie du 3e',
      address1: '12 rue de la République',
      zip: '69003',
      city: 'Lyon',
      fullAddress: '12 rue de la République\n69003 Lyon',
      shortAddress: 'Mairie du 3e, Lyon',
    });
    expect(record?.location?.geoPoint?.latitude.toString()).toBe('45.76');
    expect(record?.location?.geoPoint?.longitude.toString()).toBe('4.85');
  });

  it('emits the address in the iCalendar LOCATION and the point in GEO', async () => {
    await save({
      address1: '12 rue de la République',
      zip: '69003',
      city: 'Lyon',
      coordinates: { type: 'Point', coordinates: [4.85, 45.76] },
    });

    const result = await query.listCalendarEvents({}, window, 10);
    const document = buildFilteredCalendarDocument({
      events: result.events,
      generatedAt: new Date('2026-10-28T21:00:00.000Z'),
    }).body;

    expect(document).toContain('LOCATION:12 rue de la République\\, 69003 Lyon');
    expect(document).toContain('GEO:45.760000;4.850000');
  });

  it('updates the same address row instead of creating a new one', async () => {
    await save({ address1: '12 rue de la République', city: 'Lyon' });
    await save({ address1: '14 rue de la République', city: 'Lyon' });

    expect(await harness.prisma.locationRecord.count()).toBe(1);
    const record = await harness.prisma.locationRecord.findUnique({
      where: { locationId: 'event:event-1' },
    });
    expect(record?.address1).toBe('14 rue de la République');
  });

  it('removes stale coordinates when the source stops stating them', async () => {
    await save({
      address1: '12 rue de la République',
      city: 'Lyon',
      coordinates: { type: 'Point', coordinates: [4.85, 45.76] },
    });
    await save({ address1: '12 rue de la République', city: 'Lyon' });

    expect(await harness.prisma.geoPoint.count()).toBe(0);
  });

  it('removes the stored address when the source stops stating one', async () => {
    await save({ address1: '12 rue de la République', city: 'Lyon' });
    await save(null);

    expect(await harness.prisma.locationRecord.count()).toBe(0);
  });

  it('leaves the event without a location when the source states none', async () => {
    await save(null);

    const record = await harness.prisma.eventRecord.findUnique({
      where: { sourceEventId: 'event-1' },
    });
    expect(record?.locationId).toBeNull();

    const result = await query.listCalendarEvents({}, window, 10);
    expect(result.events[0]?.location).toBeNull();
    const document = buildFilteredCalendarDocument({
      events: result.events,
      generatedAt: new Date('2026-10-28T21:00:00.000Z'),
    }).body;
    expect(document).not.toContain('LOCATION:');
  });

  it('exposes the stored address on the group dataset read path', async () => {
    await save({
      name: 'Mairie du 3e',
      address: '12 rue de la République\n69003 Lyon',
      address1: '12 rue de la République',
      zip: '69003',
      city: 'Lyon',
      shortAddress: 'Mairie du 3e, Lyon',
      coordinates: { type: 'Point', coordinates: [4.85, 45.76] },
    });

    const dataset = await repository.getCurrent('group-1');
    expect(dataset?.events[0]?.location).toMatchObject({
      name: 'Mairie du 3e',
      address1: '12 rue de la République',
      zip: '69003',
      city: 'Lyon',
      address: '12 rue de la République\n69003 Lyon',
      shortAddress: 'Mairie du 3e, Lyon',
    });
    expect(dataset?.events[0]?.location?.coordinates?.coordinates).toEqual([4.85, 45.76]);
  });

  it('renders the place name once and never repeats the locality', async () => {
    await save({
      name: "L'UBU",
      address: '1 Rue Saint-Hélier, 35000 Rennes\n35000 Rennes',
      address1: '1 Rue Saint-Hélier, 35000 Rennes',
      address2: null,
      zip: '35000',
      city: 'Rennes',
      shortAddress: '1 Rue Saint-Hélier, 35000 Rennes, 35000, Rennes',
      coordinates: { type: 'Point', coordinates: [-1.672751, 48.107834] },
    });

    const result = await query.listCalendarEvents({}, window, 10);
    const document = buildFilteredCalendarDocument({
      events: result.events,
      generatedAt: new Date('2026-10-28T21:00:00.000Z'),
    }).body;

    expect(document).toContain("LOCATION:L'UBU\\, 1 Rue Saint-Hélier\\, 35000 Rennes");
    expect(document.match(/35000/g)).toHaveLength(1);
    expect(document.match(/Rennes/g)).toHaveLength(1);
  });
});
