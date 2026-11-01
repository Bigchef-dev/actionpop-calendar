import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { computeCalendarWindow } from '../../packages/core/src/calendar-filters/calendar-window.js';
import { parseCalendarFilter } from '../../packages/core/src/calendar-filters/calendar-filter.js';
import { resolveCalendarCriteria } from '../../packages/core/src/calendar-filters/calendar-criteria.js';
import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { PostgresCalendarEventQuery } from '../../packages/core/src/persistence/postgres-calendar-event-query.js';
import { PostgresSubjectSearch } from '../../packages/core/src/search/postgres-subject-search.js';
import type { SubjectQuery } from '../../packages/core/src/search/subject-search-types.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_search_and_group_filter' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);
const query = new PostgresCalendarEventQuery(harness.prisma);
const search = new PostgresSubjectSearch(harness.prisma);

const VERSION = 'communes-20261101-integration';
const window = computeCalendarWindow(
  { lookbackDays: 30, lookaheadDays: 90 },
  new Date('2026-11-01T12:00:00.000Z'),
);

beforeEach(async () => {
  await harness.prisma.eventGroupLink.deleteMany();
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
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
      communeCount: 2,
      departmentCount: 1,
      checksum: 'checksum',
    },
  });
  await harness.prisma.departmentReference.create({
    data: { versionId: VERSION, code: '69', name: 'Rhône', communeCount: 2 },
  });
  await harness.prisma.communeReference.createMany({
    data: [
      {
        versionId: VERSION,
        inseeCode: '69123',
        name: 'Lyon',
        normalizedName: 'lyon',
        pronounFreeNormalizedName: 'lyon',
        postalCodes: ['69001'],
        departmentCode: '69',
      },
      {
        versionId: VERSION,
        inseeCode: '69266',
        name: 'Villeurbanne',
        normalizedName: 'villeurbanne',
        pronounFreeNormalizedName: 'villeurbanne',
        postalCodes: ['69100'],
        departmentCode: '69',
      },
    ],
  });
  await harness.prisma.ingestionScope.create({
    data: {
      scopeId: 'npa-lyon',
      scopeKey: 'npa-lyon',
      scopeKind: 'group',
      displayName: 'NPA Lyon',
      retrievalStatus: 'active',
      mapStatus: 'listed',
    },
  });
});

afterAll(async () => {
  await harness.stop();
});

function q(value: string): SubjectQuery {
  return { raw: value, normalized: value.toLowerCase() };
}

function event(sourceEventId: string, groups: string[]) {
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
    groups: groups.map((id) => ({ id })),
    geography: {
      geographicStatus: 'resolved' as const,
      diagnostics: [],
      countryCode: 'FR',
      departmentCode: '69',
      communeId: '69123',
      referenceVersion: VERSION,
    },
  };
}

describe('search and group calendar', () => {
  it('resolves a commune, a department and a group from one query', async () => {
    const communes = await search.read('commune', q('lyon'), 18);
    expect(communes.candidates.map((candidate) => candidate.id)).toContain('69123');
    expect(communes.candidates[0]?.calendar.params).toEqual({ insee_commune: '69123' });

    const departments = await search.read('department', q('69'), 18);
    expect(departments.candidates[0]?.id).toBe('69');

    const groups = await search.read('group', q('npa'), 18);
    expect(groups.candidates[0]?.calendar.params).toEqual({ group: 'npa-lyon' });
  });

  it('serves the calendar of the group found by the search', async () => {
    const groupId = (await search.read('group', q('npa'), 18)).candidates[0]?.id ?? '';
    expect(groupId).toBe('npa-lyon');

    await repository.saveCurrent({
      scopeId: 'npa-lyon',
      revision: 1,
      generatedAt: '2026-11-01T12:00:00.000Z',
      status: 'complete',
      events: [event('event-group', ['npa-lyon']), event('event-other', ['attac-69'])],
    });

    const parsed = parseCalendarFilter({ group: groupId });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resolved = await resolveCalendarCriteria(parsed.criteria, undefined);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const result = await query.listCalendarEvents(resolved.criteria, window, 100);
    expect(result.events.map((item) => item.sourceEventId)).toEqual(['event-group']);
  });

  it('returns every event when no group is requested', async () => {
    await repository.saveCurrent({
      scopeId: 'npa-lyon',
      revision: 1,
      generatedAt: '2026-11-01T12:00:00.000Z',
      status: 'complete',
      events: [event('event-group', ['npa-lyon']), event('event-other', ['attac-69'])],
    });

    const result = await query.listCalendarEvents({}, window, 100);
    expect(result.events.map((item) => item.sourceEventId).sort()).toEqual([
      'event-group',
      'event-other',
    ]);
  });
});
