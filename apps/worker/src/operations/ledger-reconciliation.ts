import type { PrismaClient } from '@prisma/client';

import { queueJobState, type QueueJobState, type QueueReader } from '../dispatcher/job-state.js';

export interface LedgerReconciliation {
  readonly succeeded: number;
  readonly failed: number;
}

export interface LedgerRow {
  readonly jobId: string;
  readonly status: string;
}

const LIVE_LEDGER_STATUSES = ['scheduled', 'running', 'publishing', 'retrying'];

/** The status a stale live row should carry, given what the queue says about its job. */
export function reconciledStatus(state: QueueJobState): { status: string; error?: string } | undefined {
  switch (state.kind) {
    case 'completed':
      return { status: 'succeeded' };
    case 'failed':
      return { status: 'failed', error: state.reason };
    case 'missing':
      return { status: 'failed', error: 'abandoned: the queue no longer holds this job' };
    case 'live':
      return undefined;
  }
}

/**
 * Repairs ledger rows whose status no longer matches reality. Only rows untouched
 * for longer than the grace window are examined, so a job that is legitimately
 * running is never overwritten.
 */
export async function reconcileIngestionLedger(
  prisma: PrismaClient,
  queue: QueueReader,
  olderThan: Date,
): Promise<LedgerReconciliation> {
  const rows = await prisma.ingestionLedger.findMany({
    where: { status: { in: LIVE_LEDGER_STATUSES }, updatedAt: { lt: olderThan } },
    select: { jobId: true, status: true },
  });

  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const reconciled = reconciledStatus(await queueJobState(queue, row.jobId));
    if (reconciled === undefined) continue;

    await prisma.ingestionLedger.updateMany({
      where: { jobId: row.jobId, status: { in: LIVE_LEDGER_STATUSES } },
      data: {
        status: reconciled.status,
        ...(reconciled.error === undefined ? {} : { lastError: reconciled.error }),
      },
    });
    if (reconciled.status === 'succeeded') succeeded += 1;
    else failed += 1;
  }

  return { succeeded, failed };
}
