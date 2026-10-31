import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { MapEventSummary } from '../../packages/core/src/adapters/action-populaire-schemas.js';
import {
  countObservations,
  markRequested,
  recordListing,
  recordOutcome,
  selectGapCandidates,
} from '../../packages/core/src/persistence/postgres-map-discovery.js';
import { requestEventScopes } from '../../packages/core/src/persistence/postgres-event-scopes.js';
import { activeScopes } from '../../packages/core/src/persistence/postgres-scope-queries.js';
import { PostgresGroupRegistry } from '../../packages/core/src/persistence/postgres-group-registry.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_map_discovery' });
const registry = new PostgresGroupRegistry(harness.prisma);
const now = new Date('2026-10-31T00:00:00.000Z');

beforeEach(async () => {
  await harness.prisma.mapEventObservation.deleteMany();
  await harness.prisma.ingestionCycleMetric.deleteMany();
  await harness.prisma.eventObservation.deleteMany();
  await harness.prisma.eventGroupLink.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.processingPeriod.deleteMany();
  await harness.prisma.ingestionLedger.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

function summary(id = 'event-1', overrides: Partial<MapEventSummary> = {}): MapEventSummary {
  return {
    id,
    name: `Event ${id}`,
    start_time: '2027-10-23T16:00:00+02:00',
    end_time: '2027-10-23T18:00:00+02:00',
    subtype: 16,
    ...overrides,
  };
}

async function observation(id = 'event-1') {
  return harness.prisma.mapEventObservation.findUnique({ where: { eventId: id } });
}

async function scope(scopeId: string, kind = 'group', status = 'active') {
  await harness.prisma.ingestionScope.create({
    data: {
      scopeId,
      scopeKey: scopeId,
      scopeKind: kind,
      mapStatus: kind === 'group' ? 'listed' : 'not_applicable',
      retrievalStatus: status,
      discoverySource: kind === 'map' ? 'map_listing' : 'event_payload',
    },
  });
}

async function observedThrough(scopeId: string, eventId: string, period: string) {
  await scope(scopeId, 'group', 'active');
  await harness.prisma.processingPeriod.create({
    data: {
      periodToken: period,
      periodStartUtc: new Date(period),
      periodEndUtc: new Date(new Date(period).getTime() + 900_000),
    },
  });
  await harness.prisma.eventRecord.create({
    data: {
      sourceEventId: eventId,
      startTime: new Date('2027-10-23T14:00:00.000Z'),
      endTime: new Date('2027-10-23T16:00:00.000Z'),
      summary: 'Event',
      lastSeenPeriod: period,
    },
  });
  await harness.prisma.eventObservation.create({
    data: {
      eventId,
      viaScopeId: scopeId,
      statedGroupCount: 1,
      firstSeenPeriod: period,
      lastSeenPeriod: period,
    },
  });
}

describe('map observation ledger', () => {
  it('inserts one row, advances last_seen_at and clears the deadline only on a change', async () => {
    await recordListing(harness.prisma, [summary()], now);
    const first = await observation();
    expect(first).toMatchObject({ eventId: 'event-1', summaryFingerprint: expect.any(String) });
    expect(first?.firstSeenAt.toISOString()).toBe(now.toISOString());
    expect(first?.lastSeenAt.toISOString()).toBe(now.toISOString());

    const later = new Date(now.getTime() + 60_000);
    await harness.prisma.mapEventObservation.update({
      where: { eventId: 'event-1' },
      data: { nextReconcileAt: new Date(now.getTime() + 86_400_000) },
    });
    await recordListing(harness.prisma, [summary()], later);
    const unchanged = await observation();
    expect(unchanged?.lastSeenAt.toISOString()).toBe(later.toISOString());
    expect(unchanged?.nextReconcileAt).not.toBeNull();

    await recordListing(harness.prisma, [summary('event-1', { name: 'Changed' })], later);
    const changed = await observation();
    expect(changed?.summaryFingerprint).not.toBe(unchanged?.summaryFingerprint);
    expect(changed?.nextReconcileAt).toBeNull();
  });

  it('counts observations and records an outcome only for an existing row', async () => {
    expect(await recordOutcome(harness.prisma, 'missing', 'failed', now, now)).toBe(false);
    await recordListing(harness.prisma, [summary()], now);

    expect(
      await recordOutcome(
        harness.prisma,
        'event-1',
        'mismatched',
        now,
        new Date(now.getTime() + 86_400_000),
      ),
    ).toBe(true);
    expect(await observation()).toMatchObject({ lastOutcome: 'mismatched' });
    expect(await countObservations(harness.prisma)).toBe(1);
  });
});

describe('gap selection', () => {
  it('skips an event observed through an active scope inside the freshness horizon', async () => {
    const period = '2026-10-30T23:30:00.000Z';
    await recordListing(harness.prisma, [summary()], now);
    await observedThrough('group-1', 'event-1', period);

    expect(
      await selectGapCandidates(harness.prisma, [summary()], {
        now,
        freshnessHorizonMs: 3_600_000,
      }),
    ).toEqual([]);
  });

  it('selects the same event once the observing scope is retired or the horizon passes', async () => {
    const period = '2026-10-30T23:30:00.000Z';
    await recordListing(harness.prisma, [summary()], now);
    await observedThrough('group-1', 'event-1', period);
    await harness.prisma.ingestionScope.update({
      where: { scopeId: 'group-1' },
      data: { retrievalStatus: 'stopped_unknown' },
    });

    expect(
      await selectGapCandidates(harness.prisma, [summary()], {
        now,
        freshnessHorizonMs: 3_600_000,
      }),
    ).toEqual(['event-1']);
  });

  it('excludes an identity with a pending or active event scope', async () => {
    await recordListing(harness.prisma, [summary()], now);
    await scope('event-1', 'event', 'pending');

    expect(
      await selectGapCandidates(harness.prisma, [summary()], {
        now,
        freshnessHorizonMs: 3_600_000,
      }),
    ).toEqual([]);
  });

  it('excludes ended identities and applies the trigger predicate', async () => {
    await recordListing(
      harness.prisma,
      [summary('ended', { end_time: '2026-10-30T18:00:00+01:00' })],
      now,
    );
    expect(
      await selectGapCandidates(
        harness.prisma,
        [summary('ended', { end_time: '2026-10-30T18:00:00+01:00' })],
        { now, freshnessHorizonMs: 3_600_000 },
      ),
    ).toEqual([]);

    await recordListing(harness.prisma, [summary('fresh')], now);
    await harness.prisma.mapEventObservation.update({
      where: { eventId: 'fresh' },
      data: {
        lastRequestedAt: now,
        nextReconcileAt: new Date(now.getTime() + 86_400_000),
        lastOutcome: 'resolved',
      },
    });
    expect(
      await selectGapCandidates(harness.prisma, [summary('fresh')], {
        now,
        freshnessHorizonMs: 3_600_000,
      }),
    ).toEqual([]);

    await harness.prisma.mapEventObservation.update({
      where: { eventId: 'fresh' },
      data: { lastOutcome: 'mismatched' },
    });
    expect(
      await selectGapCandidates(harness.prisma, [summary('fresh')], {
        now,
        freshnessHorizonMs: 3_600_000,
      }),
    ).toEqual(['fresh']);
  });
});

describe('event scope requests', () => {
  it('records the map source and preserves a known end time when a hint is absent', async () => {
    await requestEventScopes(
      harness.prisma,
      [{ eventId: 'event-1', displayName: 'Event', endTime: null, discoverySource: 'map_listing' }],
      now,
    );
    let row = await harness.prisma.ingestionScope.findUnique({ where: { scopeId: 'event-1' } });
    expect(row).toMatchObject({ discoverySource: 'map_listing', eventEndsAt: null });

    await requestEventScopes(
      harness.prisma,
      [
        {
          eventId: 'event-1',
          displayName: 'Event',
          endTime: '2027-10-23T18:00:00+02:00',
          discoverySource: 'map_listing',
        },
      ],
      now,
    );
    row = await harness.prisma.ingestionScope.findUnique({ where: { scopeId: 'event-1' } });
    expect(row?.eventEndsAt?.toISOString()).toBe('2027-10-23T16:00:00.000Z');

    await requestEventScopes(
      harness.prisma,
      [{ eventId: 'event-1', displayName: 'Event', endTime: null, discoverySource: 'map_listing' }],
      now,
    );
    row = await harness.prisma.ingestionScope.findUnique({ where: { scopeId: 'event-1' } });
    expect(row?.eventEndsAt?.toISOString()).toBe('2027-10-23T16:00:00.000Z');
    expect(row?.discoverySource).toBe('map_listing');
  });

  it('marks requested identities without touching missing rows', async () => {
    await recordListing(harness.prisma, [summary()], now);
    expect(await markRequested(harness.prisma, ['event-1', 'missing'], now, now)).toBe(1);
    expect(await observation()).toMatchObject({ lastOutcome: 'requested' });
  });
});

describe('map scope lifecycle', () => {
  it('creates an active map scope and removes it from selection when disabled', async () => {
    await registry.ensureMapScope(true);
    expect(await registry.isMapScopeActive()).toBe(true);
    expect((await activeScopes(harness.prisma)).map((scope) => scope.scopeKind)).toContain('map');

    await registry.ensureMapScope(false);
    expect(await registry.isMapScopeActive()).toBe(false);
    expect((await activeScopes(harness.prisma)).map((scope) => scope.scopeKind)).not.toContain(
      'map',
    );
    expect(await harness.prisma.ingestionScope.count({ where: { scopeKind: 'map' } })).toBe(1);
  });
});
