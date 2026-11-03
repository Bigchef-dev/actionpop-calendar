import type { PrismaClient } from '@prisma/client';

/** Why an event carries no territory. `national` and `international` are legitimate, not gaps. */
export const UNATTRIBUTED_STATUSES = ['incomplete', 'invalid', 'unavailable', 'unknown'] as const;

export type UnattributedStatus = (typeof UNATTRIBUTED_STATUSES)[number];

export type UnattributedCounts = Readonly<Record<UnattributedStatus, number>>;

function statusOf(raw: string | null): UnattributedStatus | null {
  if (raw === null) return 'unknown';
  return (UNATTRIBUTED_STATUSES as readonly string[]).includes(raw)
    ? (raw as UnattributedStatus)
    : null;
}

/**
 * Counts events that could not be attached to a municipality, by reason.
 *
 * A data gap is a first-class signal: an event nobody can reach from a territory calendar is
 * invisible, and silence about it would read as "nothing to fix".
 */
export class PostgresEventCoverage {
  public constructor(private readonly prisma: PrismaClient) {}

  public async countUnattributed(): Promise<UnattributedCounts> {
    const rows = await this.prisma.eventRecord.groupBy({
      by: ['geographicStatus'],
      where: { communeId: null },
      _count: { _all: true },
    });

    const counts: Record<UnattributedStatus, number> = {
      incomplete: 0,
      invalid: 0,
      unavailable: 0,
      unknown: 0,
    };

    for (const row of rows) {
      const status = statusOf(row.geographicStatus);
      if (status === null) continue;
      counts[status] += row._count._all;
    }

    return counts;
  }
}
