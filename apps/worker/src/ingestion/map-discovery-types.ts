import type {
  CycleMetricSample,
  EventScopeRequest,
  EventScopeRequestOutcome,
  IngestionLedgerStatus,
  Logger,
  MapEventListingValidation,
  MapEventSummary,
  MapListingRecordOutcome,
  MetricsRegistry,
} from '@actionpop/core';

export interface MapDiscoveryJobContext {
  readonly jobId: string;
  readonly scopeId: string;
  readonly periodToken: string;
  readonly attemptsMade: number;
  readonly maxAttempts: number;
}

export interface LedgerTransition {
  scopeId?: string;
  periodToken?: string;
  status: IngestionLedgerStatus;
  attempts?: number;
  error?: string;
}

export interface MapDiscoveryDependencies {
  readonly client: { fetchMapEventListing(): Promise<MapEventListingValidation> };
  readonly mapDiscovery: {
    recordListing(
      summaries: readonly MapEventSummary[],
      observedAt: Date,
    ): Promise<MapListingRecordOutcome>;
    selectGapCandidates(
      summaries: readonly MapEventSummary[],
      options: { now: Date; freshnessHorizonMs: number },
    ): Promise<readonly string[]>;
    requestEventScopes(
      requests: readonly EventScopeRequest[],
      observedAt: Date,
    ): Promise<EventScopeRequestOutcome>;
    markRequested(
      eventIds: readonly string[],
      requestedAt: Date,
      nextReconcileAt: Date,
    ): Promise<number>;
  };
  readonly isEnabled: () => Promise<boolean>;
  readonly freshnessHorizonMs: number;
  readonly reconciliationIntervalMs: number;
  readonly ledger: { transition(jobId: string, patch: LedgerTransition): Promise<void> };
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
  readonly cycleMetrics: {
    increment(periodToken: string, samples: readonly CycleMetricSample[]): Promise<void>;
  };
  readonly now?: () => Date;
}
