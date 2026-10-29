import { Prisma } from '@prisma/client';

import { parsePeriodToken } from '../domain/job-identity.js';
import type { CycleMetricSample } from '../groups/cycle-metrics.js';
import type { RegistryClient } from './postgres-group-registry.js';

const PERIOD_INTERVAL_MS = 15 * 60 * 1000;

export interface CycleMetricReading {
  readonly periodToken: string;
  readonly metrics: Readonly<Record<string, number>>;
}

/** Per-cycle counters, stored so "the last completed cycle" is answerable without log aggregation. */
export class PostgresCycleMetrics {
  public constructor(private readonly client: RegistryClient) {}

  public async increment(
    periodToken: string,
    samples: readonly CycleMetricSample[],
  ): Promise<void> {
    if (samples.length === 0) return;

    const start = parsePeriodToken(periodToken);
    const canonical = start.toISOString();

    await this.client.$executeRaw(Prisma.sql`
      INSERT INTO "processing_period" ("period_token", "period_start_utc", "period_end_utc")
      VALUES (${canonical}::text, ${start}::timestamptz, ${new Date(start.getTime() + PERIOD_INTERVAL_MS)}::timestamptz)
      ON CONFLICT ("period_token") DO NOTHING
    `);

    const rows = Prisma.join(
      samples.map(
        (sample) =>
          Prisma.sql`(${canonical}::text, ${sample.metric}::text, ${sample.value}::int)`,
      ),
    );

    await this.client.$executeRaw(Prisma.sql`
      INSERT INTO "ingestion_cycle_metric" ("period_token", "metric", "value")
      VALUES ${rows}
      ON CONFLICT ("period_token", "metric")
      DO UPDATE SET "value" = "ingestion_cycle_metric"."value" + EXCLUDED."value"
    `);
  }

  public async read(periodToken: string): Promise<CycleMetricReading | undefined> {
    const canonical = parsePeriodToken(periodToken).toISOString();
    const rows = await this.client.$queryRaw<{ metric: string; value: number }[]>(Prisma.sql`
      SELECT "metric", "value" FROM "ingestion_cycle_metric"
      WHERE "period_token" = ${canonical}::text
      ORDER BY "metric" ASC
    `);
    if (rows.length === 0) return undefined;
    return {
      periodToken: canonical,
      metrics: Object.fromEntries(rows.map((row) => [row.metric, row.value])),
    };
  }

  public async latestBefore(periodToken: string): Promise<CycleMetricReading | undefined> {
    const canonical = parsePeriodToken(periodToken).toISOString();
    const rows = await this.client.$queryRaw<{ period_token: string }[]>(Prisma.sql`
      SELECT DISTINCT "period_token" FROM "ingestion_cycle_metric"
      WHERE "period_token" < ${canonical}::text
      ORDER BY "period_token" DESC
      LIMIT 1
    `);
    const previous = rows[0]?.period_token;
    return previous === undefined ? undefined : this.read(previous);
  }
}
