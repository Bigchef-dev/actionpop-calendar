import { Prisma, type PrismaClient } from '@prisma/client';

import { LEDGER_GRACE_MS } from '../config/defaults.config.js';
import type {
  CurrentRunCounts,
  CurrentRunReading,
  SettledRun,
  UpdateStatusReader,
} from '../models/update-status.js';
import { countsFromStatuses } from '../updates/update-status.js';

interface LedgerAggregateRow {
  readonly period_token?: string;
  readonly scope_kind: string;
  readonly status: string;
  readonly count: number;
  readonly updated_at: Date | null;
}

interface CoverageRow {
  readonly observed: number;
  readonly total: number;
}

interface PeriodCoverageRow {
  readonly period_token: string;
  readonly observed: number;
}

interface PeriodAggregate {
  readonly all: Record<string, number>;
  readonly groups: Record<string, number>;
  completedAt: Date | null;
}

function emptyCounts(): CurrentRunCounts {
  return { processed: 0, failed: 0, remaining: 0, total: 0 };
}

/** Event coverage: observed events out of every published event; no per-event failure count. */
function coverageCounts(observed: number, total: number): CurrentRunCounts {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0;
  const processed = Math.max(0, Math.min(Math.trunc(observed), safeTotal));
  return {
    processed,
    failed: 0,
    remaining: safeTotal - processed,
    total: safeTotal,
  };
}

function addStatus(target: Record<string, number>, status: string, count: number): void {
  target[status] = (target[status] ?? 0) + count;
}

function latest(left: Date | null, right: Date | null): Date | null {
  if (left === null) return right;
  if (right === null) return left;
  return right > left ? right : left;
}

/** A group count with unresolved work moved to failed when its period was abandoned. */
function closedCounts(counts: CurrentRunCounts): CurrentRunCounts {
  return counts.remaining > 0
    ? { ...counts, failed: counts.failed + counts.remaining, remaining: 0 }
    : counts;
}

/**
 * Aggregates the worker's ledger and the published event observations into the public read model.
 *
 * Group progress comes from ledger rows joined to their scope kind. Event progress is coverage:
 * distinct events observed in the period out of every distinct event ever observed. Scope, job
 * and error columns exist on the tables but are never selected, so they cannot reach the answer.
 */
export class PostgresUpdateStatus implements UpdateStatusReader {
  public constructor(private readonly prisma: PrismaClient) {}

  public async current(periodStartUtc: Date): Promise<CurrentRunReading | null> {
    const token = periodStartUtc.toISOString();
    const [ledger, coverage] = await Promise.all([
      this.prisma.$queryRaw<readonly LedgerAggregateRow[]>(Prisma.sql`
        SELECT s."scope_kind" AS scope_kind, l."status" AS status,
               COUNT(*)::int AS count, MAX(l."updated_at") AS updated_at
        FROM "ingestion_ledger" l
        JOIN "ingestion_scope" s ON s."scope_id" = l."scope_id"
        WHERE l."period_token" = ${token}
        GROUP BY s."scope_kind", l."status"
      `),
      this.prisma.$queryRaw<readonly CoverageRow[]>(Prisma.sql`
        SELECT
          (COUNT(DISTINCT "event_id") FILTER (WHERE "last_seen_period" = ${token}))::int AS observed,
          (COUNT(DISTINCT "event_id"))::int AS total
        FROM "event_observation"
      `),
    ]);
    if (ledger.length === 0) return null;

    const all: Record<string, number> = {};
    const groups: Record<string, number> = {};
    let completedAt: Date | null = null;
    for (const row of ledger) {
      addStatus(all, row.status, row.count);
      if (row.scope_kind === 'group') addStatus(groups, row.status, row.count);
      completedAt = latest(completedAt, row.updated_at);
    }

    const observed = coverage[0]?.observed ?? 0;
    const totalEvents = coverage[0]?.total ?? 0;
    return {
      counts: countsFromStatuses(all),
      groups: countsFromStatuses(groups),
      events: coverageCounts(observed, totalEvents),
      completedAt,
    };
  }

  public async settled(
    limit: number,
    beforePeriodStartUtc: Date,
    now: Date,
  ): Promise<readonly SettledRun[]> {
    if (limit <= 0) return [];
    const periods = await this.prisma.processingPeriod.findMany({
      where: { periodStartUtc: { lt: beforePeriodStartUtc } },
      orderBy: { periodStartUtc: 'desc' },
      take: Math.max(limit * 3, limit + 3),
      select: { periodToken: true, periodStartUtc: true },
    });
    if (periods.length === 0) return [];

    const tokens = periods.map((period) => period.periodToken);
    const [ledger, coverage, totalCoverage] = await Promise.all([
      this.prisma.$queryRaw<readonly LedgerAggregateRow[]>(Prisma.sql`
        SELECT l."period_token" AS period_token, s."scope_kind" AS scope_kind,
               l."status" AS status, COUNT(*)::int AS count, MAX(l."updated_at") AS updated_at
        FROM "ingestion_ledger" l
        JOIN "ingestion_scope" s ON s."scope_id" = l."scope_id"
        WHERE l."period_token" IN (${Prisma.join(tokens)})
        GROUP BY l."period_token", s."scope_kind", l."status"
      `),
      this.prisma.$queryRaw<readonly PeriodCoverageRow[]>(Prisma.sql`
        SELECT "last_seen_period" AS period_token, COUNT(DISTINCT "event_id")::int AS observed
        FROM "event_observation"
        WHERE "last_seen_period" IN (${Prisma.join(tokens)})
        GROUP BY "last_seen_period"
      `),
      this.prisma.$queryRaw<readonly CoverageRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT "event_id")::int AS total FROM "event_observation"
      `),
    ]);

    const byPeriod = new Map<string, PeriodAggregate>();
    for (const row of ledger) {
      const token = row.period_token;
      if (token === undefined) continue;
      const aggregate = byPeriod.get(token) ?? { all: {}, groups: {}, completedAt: null };
      addStatus(aggregate.all, row.status, row.count);
      if (row.scope_kind === 'group') addStatus(aggregate.groups, row.status, row.count);
      aggregate.completedAt = latest(aggregate.completedAt, row.updated_at);
      byPeriod.set(token, aggregate);
    }
    const observedByPeriod = new Map(
      coverage.map((row) => [row.period_token, row.observed] as const),
    );
    const totalEvents = totalCoverage[0]?.total ?? 0;

    const settled: SettledRun[] = [];
    for (const period of periods) {
      const aggregate = byPeriod.get(period.periodToken);
      if (aggregate === undefined) continue;
      const counts = countsFromStatuses(aggregate.all);
      if (counts.processed + counts.failed === 0) continue;

      const abandoned = period.periodStartUtc.getTime() + LEDGER_GRACE_MS <= now.getTime();
      if (counts.remaining > 0 && !abandoned) continue;

      settled.push({
        periodStartUtc: period.periodStartUtc,
        completedAt: aggregate.completedAt ?? period.periodStartUtc,
        counts: abandoned ? closedCounts(counts) : counts,
        groups: abandoned
          ? closedCounts(countsFromStatuses(aggregate.groups))
          : countsFromStatuses(aggregate.groups),
        events: coverageCounts(observedByPeriod.get(period.periodToken) ?? 0, totalEvents),
      });
      if (settled.length >= limit) break;
    }
    return settled;
  }
}

export { emptyCounts };
