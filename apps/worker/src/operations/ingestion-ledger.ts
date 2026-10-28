import type { IngestionLedgerStatus } from '@actionpop/core';
import { buildRedisKey, parsePeriodToken } from '@actionpop/core';
import type { PrismaClient } from '@prisma/client';

interface LedgerPatch {
  scopeId?: string;
  periodToken?: string;
  status: IngestionLedgerStatus;
  attempts?: number;
  error?: string;
}

type StoredLedger = LedgerPatch & { attempts: number; error?: string };

export class IngestionLedgerStore {
  private readonly values = new Map<string, StoredLedger>();

  public transition(jobId: string, patch: LedgerPatch): void {
    const previous = this.values.get(jobId);
    const error = patch.error?.replace(/upstream token=.* failed/i, 'upstream failed');
    this.values.set(jobId, {
      ...previous,
      ...patch,
      attempts: patch.attempts ?? previous?.attempts ?? 0,
      ...(error === undefined ? {} : { error }),
    });
  }

  public get(jobId: string): StoredLedger | undefined {
    return this.values.get(jobId);
  }
}

export class RedisIngestionLedgerStore {
  public constructor(
    private readonly redis: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<unknown>;
    },
    private readonly namespace = 'actionpop',
  ) {}

  public async transition(jobId: string, patch: LedgerPatch): Promise<void> {
    const previous = await this.get(jobId);
    const error = patch.error?.replace(/upstream token=.* failed/i, 'upstream failed');
    await this.redis.set(
      this.key(jobId),
      JSON.stringify({
        ...previous,
        ...patch,
        attempts: patch.attempts ?? previous?.attempts ?? 0,
        ...(error === undefined ? {} : { error }),
      }),
    );
  }

  public async get(jobId: string): Promise<StoredLedger | undefined> {
    const value = await this.redis.get(this.key(jobId));
    return value === null ? undefined : (JSON.parse(value) as StoredLedger);
  }

  public async isScheduled(jobId: string): Promise<boolean> {
    const value = await this.get(jobId);
    return (
      value?.status === 'scheduled' || value?.status === 'running' || value?.status === 'retrying'
    );
  }

  private key(jobId: string): string {
    return buildRedisKey(this.namespace, 'ledger', jobId);
  }
}

export class PostgresIngestionLedgerStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async transition(jobId: string, patch: LedgerPatch): Promise<void> {
    const previous = await this.get(jobId);
    const error = patch.error?.replace(/upstream token=.* failed/i, 'upstream failed');
    const scopeId = patch.scopeId ?? previous?.scopeId;
    const periodToken = patch.periodToken ?? previous?.periodToken;
    if (scopeId === undefined || periodToken === undefined) {
      throw new Error(`ledger ${jobId} requires scopeId and periodToken`);
    }

    const start = parsePeriodToken(periodToken);
    const canonicalToken = start.toISOString();
    const attempts = patch.attempts ?? previous?.attempts ?? 0;

    // Concurrent jobs share the same scope and period rows, so every parent is inserted
    // idempotently with `createMany({ skipDuplicates })`; an upsert would race and fail
    // on the primary key instead of updating.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.groupScope.createMany({
        data: [{ scopeId, active: true }],
        skipDuplicates: true,
      });
      await transaction.processingPeriod.createMany({
        data: [
          {
            periodToken: canonicalToken,
            periodStartUtc: start,
            periodEndUtc: new Date(start.getTime() + 15 * 60 * 1000),
          },
        ],
        skipDuplicates: true,
      });
      await transaction.ingestionLedger.createMany({
        data: [
          {
            jobId,
            scopeId,
            periodToken: canonicalToken,
            status: patch.status,
            attempts,
            lastError: error ?? null,
          },
        ],
        skipDuplicates: true,
      });
      // updateMany never throws when the row was skipped above, which keeps a concurrent
      // transition from turning into a hard failure.
      await transaction.ingestionLedger.updateMany({
        where: { jobId },
        data: {
          status: patch.status,
          periodToken: canonicalToken,
          attempts,
          lastError: error ?? null,
        },
      });
    });
  }

  public async get(jobId: string): Promise<StoredLedger | undefined> {
    const value = await this.prisma.ingestionLedger.findUnique({ where: { jobId } });
    if (value === null) return undefined;
    return {
      scopeId: value.scopeId,
      periodToken: value.periodToken,
      status: value.status as IngestionLedgerStatus,
      attempts: value.attempts,
      ...(value.lastError === null ? {} : { error: value.lastError }),
    };
  }

  public async isScheduled(jobId: string): Promise<boolean> {
    const value = await this.get(jobId);
    return (
      value?.status === 'scheduled' || value?.status === 'running' || value?.status === 'retrying'
    );
  }
}
