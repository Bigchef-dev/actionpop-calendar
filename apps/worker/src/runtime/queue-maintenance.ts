import type { Queue } from 'bullmq';

import type { ResetTarget } from './maintenance-targets.js';

/** States whose jobs can be removed safely; an `active` job is left to finish. */
const REMOVABLE_STATES = ['waiting', 'delayed', 'completed', 'failed'] as const;

interface JobData {
  readonly scopeKind?: string;
  readonly periodStartUtc?: string;
}

function targetOf(jobData: unknown): ResetTarget | undefined {
  const data = (jobData ?? {}) as JobData;
  if (data.scopeKind === 'map') return 'map';
  if (data.scopeKind === 'event') return 'events';
  if (data.scopeKind === undefined || data.scopeKind === 'group') return 'groups';
  return undefined;
}

function matches(
  jobData: unknown,
  targets: readonly ResetTarget[],
  periodStartUtc: string,
): boolean {
  const target = targetOf(jobData);
  if (target === undefined || !targets.includes(target)) return false;
  return (jobData as JobData).periodStartUtc === periodStartUtc;
}

export interface DiscoveredJobs {
  readonly removable: readonly string[];
  readonly active: readonly string[];
}

/**
 * Finds this period's jobs for the selected targets. Scanning the queue, rather than
 * deriving identifiers from the database, also catches jobs left behind by an older
 * volume: they carry their own kind and period in the payload.
 */
export async function discoverResettableJobs(
  queue: Queue,
  targets: readonly ResetTarget[],
  periodStartUtc: string,
): Promise<DiscoveredJobs> {
  const jobs = await queue.getJobs([...REMOVABLE_STATES], 0, -1, true);
  const activeJobs = await queue.getJobs(['active'], 0, -1, true);
  return {
    removable: jobs
      .filter((job) => matches(job.data, targets, periodStartUtc))
      .map((job) => String(job.id)),
    active: activeJobs
      .filter((job) => matches(job.data, targets, periodStartUtc))
      .map((job) => String(job.id)),
  };
}

export interface RemovedJobs {
  readonly removed: number;
  readonly active: readonly string[];
  readonly failed: number;
}

/** Removes the given jobs one by one, never touching one currently owned by a worker. */
export async function removeJobsById(
  queue: Queue,
  jobIds: readonly string[],
): Promise<RemovedJobs> {
  let removed = 0;
  const active: string[] = [];
  let failed = 0;
  for (const jobId of new Set(jobIds)) {
    const job = await queue.getJob(jobId);
    if (job === undefined) continue;
    if ((await job.getState()) === 'active') {
      active.push(jobId);
      continue;
    }
    try {
      await job.remove();
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, active, failed };
}
