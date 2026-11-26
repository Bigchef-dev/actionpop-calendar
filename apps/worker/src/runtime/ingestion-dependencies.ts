import {
  markRequested,
  recordListing,
  recordOutcome,
  requestEventScopes,
  retireUnknownEventScope,
  selectGapCandidates,
} from '@actionpop/core';

import type { IngestionDependencies } from '../ingestion/job-dispatch.js';
import type { WorkerInfrastructure } from './infrastructure.js';

/**
 * Assembles the dependency set shared by the group, event and map processors. The map
 * discovery callbacks are the only ones that need the configured freshness window, so
 * they are built here rather than in the processors.
 */
export function createIngestionDependencies(infra: WorkerInfrastructure): IngestionDependencies {
  const { config, client, ledger, eventTypes, geographicReference, revisions, publisher } = infra;
  const { registry, observability, cycleMetrics, postgres } = infra;

  return {
    client,
    ledger,
    eventTypes,
    geographicReference,
    revisions,
    publisher,
    groups: registry,
    scopes: {
      retireUnknownEvent: (scopeId, at) => retireUnknownEventScope(postgres, scopeId, at),
    },
    metrics: observability.metrics,
    logger: observability.logger,
    cycleMetrics,
    mapDiscovery: {
      recordListing: (summaries, observedAt) => recordListing(postgres, summaries, observedAt),
      selectGapCandidates: (summaries, options) =>
        selectGapCandidates(postgres, summaries, options),
      requestEventScopes: (requests, observedAt) =>
        requestEventScopes(postgres, requests, observedAt),
      markRequested: (eventIds, requestedAt, nextReconcileAt) =>
        markRequested(postgres, eventIds, requestedAt, nextReconcileAt),
      recordOutcome: (eventId, outcome, at) =>
        recordOutcome(
          postgres,
          eventId,
          outcome,
          at,
          outcome === 'failed'
            ? at
            : new Date(at.getTime() + config.ingestion.mapReconciliationIntervalMs),
        ),
    },
    isEnabled: async () =>
      config.ingestion.mapDiscoveryEnabled && (await registry.isMapScopeActive()),
    freshnessHorizonMs: config.ingestion.mapFreshnessHorizonMs,
    reconciliationIntervalMs: config.ingestion.mapReconciliationIntervalMs,
  };
}
