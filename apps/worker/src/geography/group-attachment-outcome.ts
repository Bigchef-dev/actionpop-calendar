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

export interface RefresherOptions {
  /** How long an attachment is trusted before the address is read again. */
  readonly staleAfterMs?: number;
  readonly now?: () => Date;
}
