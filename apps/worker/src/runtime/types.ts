import type { ScopeKind } from '@actionpop/core';

import type { RefreshGeographicReferenceInput } from '../geography/reference-refresh.js';

/** Payload carried by a BullMQ ingestion job. */
export interface IngestionJobData {
  readonly scopeId: string;
  /** Absent for a job enqueued before scopes carried a kind; such a job is a group listing. */
  readonly scopeKind?: ScopeKind;
  readonly periodStartUtc: string;
}

export interface RefreshGeographicReferenceResultSummary {
  readonly version: string;
  readonly status: 'staged' | 'active' | 'rejected';
  readonly counts: { communes: number; departments: number; epcis: number; memberships: number };
  readonly diagnosticCount: number;
}

/**
 * The worker as seen by scripts and tests: an assembled runtime whose lifecycle is
 * explicit. `createWorkerRuntime` only wires dependencies; nothing connects until
 * `start()` runs.
 */
export interface WorkerRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
  readiness(): Promise<boolean>;
  refreshGeographicReference(
    input: RefreshGeographicReferenceInput,
  ): Promise<RefreshGeographicReferenceResultSummary>;
  syncObservedEventTypes(values: string[], source?: string): Promise<number>;
}
