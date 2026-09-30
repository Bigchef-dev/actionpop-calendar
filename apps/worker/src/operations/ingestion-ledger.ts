import type { IngestionLedgerStatus } from '@actionpop/core';

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