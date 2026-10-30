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

/** The dependency superset both ingestion kinds need. */
export type IngestionDependencies = CalendarIngestionDependencies & EventIngestionDependencies;

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
  if (job.scopeKind === 'event') {
    await processEventIngestion(job, deps);
    return;
  }
  await processCalendarIngestion(job, deps);
}
