import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  FilteredCalendarService,
  type CalendarEvent,
} from '../../packages/core/src/index.js';
import { normalizeEpciName } from '../../packages/core/src/geography/epci-reference.js';
import { CommuneNameResolver } from '../../packages/core/src/geography/commune-name-resolver.js';
import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { PostgresCalendarEventQuery } from '../../packages/core/src/persistence/postgres-calendar-event-query.js';
import { PostgresGeographicReferenceRepository } from '../../packages/core/src/persistence/geographic-reference-repository.js';
import { PostgresSubjectSearch } from '../../packages/core/src/search/postgres-subject-search.js';
import type { SubjectQuery } from '../../packages/core/src/search/subject-search-types.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_epci_calendar' });
const search = new PostgresSubjectSearch(harness.prisma);
const referenceReader = new PostgresGeographicReferenceRepository(harness.prisma);
const repository = new PostgresCalendarDatasetRepository(harness.prisma);

const VERSION = 'communes-20261101-epci';
const EPCI_ID = '200000001';
const OTHER_EPCI_ID = '200000002';

const calendar = new FilteredCalendarService(
  new PostgresCalendarEventQuery(harness.prisma),
  { lookbackDays: 30, lookaheadDays: 90, maxEntries: 100 },
  new CommuneNameResolver(referenceReader),
);

const NOW = new Date('2026-11-01T12:00:00.000Z');

beforeEach(async () => {
  await harness.prisma.eventGroupLink.deleteMany();
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
  await harness.prisma.epciMembership.deleteMany();
  await harness.prisma.epciReference.deleteMany();
  await harness.prisma.communeReference.deleteMany();
  await harness.prisma.departmentReference.deleteMany();
  await harness.prisma.geographicReferenceVersion.deleteMany();

  await harness.prisma.geographicReferenceVersion.create({
    data: {
      version: VERSION,
      status: 'active',
      source: 'integration',
      publicationDate: '2026-11-01',
      ingestedAt: new Date('2026-11-01T00:00:00.000Z'),
      license: 'test',
      communeCount: 3,
      departmentCount: 1,
      checksum: 'checksum',
    },
  });
  await harness.prisma.departmentReference.create({
    data: { versionId: VERSION, code: '01', name: 'Ain', communeCount: 3 },
  });
  await harness.prisma.communeReference.createMany({
    data: [
      commune('01001', 'Ambérieu'),
      commune('01002', 'Bellegarde'),
      commune('01003', 'HorsTerritoire'),
    ],
  });
  await harness.prisma.ingestionScope.create({
    data: {
      scopeId: 'npa-ain',
      scopeKey: 'npa-ain',
      scopeKind: 'group',
      displayName: 'NPA Ain',
      retrievalStatus: 'active',
      mapStatus: 'listed',
    },
  });
  await harness.prisma.epciReference.createMany({
    data: [
      {
        versionId: VERSION,
        epciId: EPCI_ID,
        name: 'Métropole du Grand Exemple',
        normalizedName: normalizeEpciName('Métropole du Grand Exemple'),
        kind: 'METRO',
        departmentCodes: ['01'],
        active: true,
      },
      {
        versionId: VERSION,
        epciId: OTHER_EPCI_ID,
        name: 'Communauté de communes du Retrait',
        normalizedName: normalizeEpciName('Communauté de communes du Retrait'),
        kind: 'CC',
        departmentCodes: ['01'],
        active: false,
      },
    ],
  });
  await harness.prisma.epciMembership.createMany({
    data: [
      { versionId: VERSION, epciId: EPCI_ID, communeId: '01001', quality: 'complete' },
      { versionId: VERSION, epciId: EPCI_ID, communeId: '01002', quality: 'complete' },
    ],
  });

  await repository.saveCurrent({
    scopeId: 'npa-ain',
    revision: 1,
    generatedAt: NOW.toISOString(),
    status: 'complete',
    events: [
      event('event-amb', '01001'),
      event('event-bel', '01002'),
      event('event-out', '01003'),
    ],
  });
});

afterAll(async () => {
  await harness.stop();
});

function commune(inseeCode: string, name: string) {
  return {
    versionId: VERSION,
    inseeCode,
    name,
    normalizedName: name.toLowerCase(),
    pronounFreeNormalizedName: name.toLowerCase(),
    postalCodes: [`${inseeCode.slice(-3)}00`],
    departmentCode: '01',
  };
}

function event(sourceEventId: string, communeId: string): CalendarEvent {
  return {
    id: sourceEventId,
    sourceEventId,
    name: `Event ${sourceEventId}`,
    startTime: '2026-11-05T10:00:00+01:00',
    endTime: '2026-11-05T11:00:00+01:00',
    location: null,
    contentHash: `hash-${sourceEventId}`,
    sequence: 0,
    eventType: 'tractage',
    groups: [],
    geography: {
      geographicStatus: 'resolved',
      diagnostics: [],
      countryCode: 'FR',
      departmentCode: '01',
      communeId,
      referenceVersion: VERSION,
    },
  };
}

function q(value: string): SubjectQuery {
  return { raw: value, normalized: value.toLowerCase() };
}

describe('EPCI end-to-end', () => {
  it('finds the territory by a partial accented name and exposes its calendar parameter', async () => {
    const found = await search.read('epci', q('metropole du grand'), 18);

    expect(found.candidates).toHaveLength(1);
    expect(found.candidates[0]).toMatchObject({
      kind: 'epci',
      id: EPCI_ID,
      label: 'Métropole du Grand Exemple',
      qualifier: 'Métropole · 01',
      calendar: { path: '/calendar.ics', params: { epci: EPCI_ID } },
    });
  });

  it('never returns a retired territory', async () => {
    const found = await search.read('epci', q('retrait'), 18);
    expect(found.candidates).toEqual([]);
  });

  it('serves only the events of the member communes, once each', async () => {
    const subject = (await search.read('epci', q('metropole'), 18)).candidates[0];
    expect(subject).toBeDefined();

    const result = await calendar.build(
      { epci: String(subject?.calendar.params.epci) },
      { now: () => NOW, requestInstant: NOW },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.criteria.communeIds).toEqual(['01001', '01002']);
    const uids = [...result.body.matchAll(/UID:(event-[a-z]+)@/g)].map((match) => match[1]);
    expect(uids.sort()).toEqual(['event-amb', 'event-bel']);
  });

  it('keeps event-type and group filters combined with the territory', async () => {
    const result = await calendar.build(
      { epci: EPCI_ID, event_type: 'boitage' },
      { now: () => NOW, requestInstant: NOW },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).not.toContain('BEGIN:VEVENT');
  });

  it('fails closed when the membership is incomplete', async () => {
    await harness.prisma.epciMembership.updateMany({
      data: { quality: 'unverified' },
    });

    const result = await calendar.build({ epci: EPCI_ID }, { now: () => NOW });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({
      code: 'epci_membership_incomplete',
      severity: 'error',
    });
  });

  it('fails closed when the territory no longer exists', async () => {
    const result = await calendar.build({ epci: '299999999' }, { now: () => NOW });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({ code: 'epci_invalid' });
  });

  it('exposes the territory when its memberships were removed', async () => {
    await harness.prisma.epciMembership.deleteMany();

    const result = await calendar.build({ epci: EPCI_ID }, { now: () => NOW });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({ code: 'epci_membership_incomplete' });
  });

  it('leaves existing commune, department and group links unchanged', async () => {
    const byCommune = await calendar.build({ insee_commune: '01001' }, { now: () => NOW });
    const byDepartment = await calendar.build({ department: '01' }, { now: () => NOW });
    const byGroup = await calendar.build({ group: 'npa-ain' }, { now: () => NOW });

    for (const result of [byCommune, byDepartment, byGroup]) {
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.body).toContain('BEGIN:VCALENDAR');
    }
    expect(byDepartment.ok && byDepartment.body).toContain('event-out');
  });
});
