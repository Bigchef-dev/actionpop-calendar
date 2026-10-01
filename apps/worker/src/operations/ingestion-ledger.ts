import type { IngestionLedgerStatus } from '@actionpop/core';
import { buildRedisKey } from '@actionpop/core';

interface LedgerPatch {
  scopeId?: string;
  periodToken?: string;
  status: IngestionLedgerStatus;
  attempts?: number;
  error?: string;
}

export class IngestionLedgerStore {
  private readonly values = new Map<string, LedgerPatch & { attempts: number; error?: string }>();

  public transition(jobId: string, patch: LedgerPatch): void {
    const previous = this.values.get(jobId);
    const error = patch.error?.replace(/upstream token=.* failed/i, 'upstream failed');
    this.values.set(jobId, {
      ...previous, ...patch, attempts: patch.attempts ?? previous?.attempts ?? 0,
      ...(error === undefined ? {} : { error }),
    });
  }

  public get(jobId: string) { return this.values.get(jobId); }
}

export class RedisIngestionLedgerStore {
  public constructor(private readonly redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
  }, private readonly namespace = 'actionpop') {}

  public async transition(jobId: string, patch: LedgerPatch): Promise<void> {
    const previous = await this.get(jobId);
    const error = patch.error?.replace(/upstream token=.* failed/i, 'upstream failed');
    await this.redis.set(this.key(jobId), JSON.stringify({
      ...previous, ...patch, attempts: patch.attempts ?? previous?.attempts ?? 0,
      ...(error === undefined ? {} : { error }),
    }));
  }

  public async get(jobId: string): Promise<(LedgerPatch & { attempts: number; error?: string }) | undefined> {
    const value = await this.redis.get(this.key(jobId));
    return value === null ? undefined : JSON.parse(value) as LedgerPatch & { attempts: number; error?: string };
  }

  public async isScheduled(jobId: string): Promise<boolean> {
    const value = await this.get(jobId);
    return value?.status === 'scheduled' || value?.status === 'running' || value?.status === 'retrying';
  }

  private key(jobId: string): string {
    return buildRedisKey(this.namespace, 'ledger', jobId);
  }
}