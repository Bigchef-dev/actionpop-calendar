import type { ActionPopulaireLocation } from '@actionpop/core';

/**
 * The contract of the group enrichment step: what it reports and what it needs. Kept apart from
 * the orchestration so a caller (the cycle, a test, a script) depends on the shape only.
 */
export interface AttachmentOutcome {
  readonly version: string;
  readonly resolved: number;
  readonly incomplete: number;
  readonly international: number;
  readonly invalid: number;
  readonly skipped: number;
  readonly failed: number;
}

export interface GroupAttachmentRefresher {
  refresh(version: string): Promise<AttachmentOutcome>;
}

/** Reads one group's detail document; a `null` answer means the source does not know the group. */
export interface GroupDetailSource {
  fetchGroupDetail(
    groupId: string,
  ): Promise<{ readonly location?: ActionPopulaireLocation | null | undefined }>;
}

/** One progress report every this many upstream reads: frequent enough to look alive. */
export const ATTACHMENT_PROGRESS_STEP = 25;

export interface RefresherOptions {
  /** How long an attachment is trusted before the address is read again. */
  readonly staleAfterMs?: number;
  readonly now?: () => Date;
  /**
   * Reports how far the sequential upstream reads have progressed. A full catalogue means one
   * detail read per listed group, so without this a first cycle looks hung for minutes while it
   * is in fact working; the callback is how the operator sees that.
   */
  readonly onProgress?: (progress: {
    readonly processed: number;
    readonly total: number;
    readonly failed: number;
  }) => void;
}

/** Reports progress to a caller that asked for it, and does nothing otherwise. */
export function reportAttachmentProgress(
  options: RefresherOptions,
  processed: number,
  total: number,
  failed: number,
): void {
  options.onProgress?.({ processed, total, failed });
}
