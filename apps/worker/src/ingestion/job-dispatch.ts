import type { ScopeKind } from '@actionpop/core';

import {
  processCalendarIngestion,
  type CalendarIngestionDependencies,
  type IngestionJobContext,
} from './calendar-ingestion-processor.js';
import {
  processEventIngestion,
  type EventIngestionDependencies,
} from './event-ingestion-processor.js';
import {
  processMapDiscovery,
  type MapDiscoveryDependencies,
} from './map-discovery-processor.js';

/** The dependency superset every ingestion kind needs. */
export type IngestionDependencies = CalendarIngestionDependencies &
  EventIngestionDependencies &
  MapDiscoveryDependencies;

export interface DispatchedIngestionJob extends IngestionJobContext {
  readonly scopeKind: ScopeKind;
}

/**
 * Chooses the retrieval protocol from the scope kind. Each kind keeps its own job body;
 * everything after the retrieval is shared.
 */
export async function processIngestionJob(
  job: DispatchedIngestionJob,
  deps: IngestionDependencies,
): Promise<void> {
  if (job.scopeKind === 'map') {
    await processMapDiscovery(job, deps);
    return;
  }
  if (job.scopeKind === 'event') {
    await processEventIngestion(job, deps);
    return;
  }
  await processCalendarIngestion(job, deps);
}
