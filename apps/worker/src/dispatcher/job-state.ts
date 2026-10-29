export type QueueJobState =
  | { kind: 'live' }
  | { kind: 'completed' }
  | { kind: 'failed'; reason: string }
  | { kind: 'missing' };

export interface QueueJob {
  getState(): Promise<string>;
  failedReason?: string;
}

export interface QueueReader {
  getJob(jobId: string): Promise<QueueJob | undefined>;
}

const LIVE_STATES = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children', 'paused']);

/**
 * The queue is the source of truth for what happened to a scheduled job. A ledger
 * row alone cannot tell a job still running from one the queue finished or lost:
 * Redis may be restarted, cleaned, or simply have completed the work already.
 */
export async function queueJobState(queue: QueueReader, jobId: string): Promise<QueueJobState> {
  const job = await queue.getJob(jobId);
  if (job === undefined) return { kind: 'missing' };

  const state = await job.getState();
  if (state === 'completed') return { kind: 'completed' };
  if (state === 'failed') {
    return { kind: 'failed', reason: job.failedReason ?? 'the queue reports a failed job' };
  }
  if (LIVE_STATES.has(state)) return { kind: 'live' };
  return { kind: 'missing' };
}
