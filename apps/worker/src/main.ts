import { fileURLToPath } from 'node:url';

import { startWorker } from './runtime/lifecycle.js';

export { toIncomingEvent } from './ingestion/event-mapper.js';
export { EventTypeValidationError } from './ingestion/calendar-ingestion-processor.js';
export { createWorkerRuntime } from './runtime/runtime.js';
export type { RefreshGeographicReferenceResultSummary, WorkerRuntime } from './runtime/types.js';
export { startWorker };

const isEntryModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryModule) {
  void startWorker().catch((error: unknown) => {
    console.error('worker startup failed', error);
    process.exitCode = 1;
  });
}
