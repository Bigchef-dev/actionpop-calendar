import { createJourneyReporter } from './journey';

/**
 * The application's single journey reporter.
 *
 * One instance means one queue: two components tracking the same step cannot produce two batches
 * that a dashboard would read as two visits.
 */
export const journey = createJourneyReporter();

export type { JourneyStep } from './journey';

// A hidden or closing page must not lose the batch: the queue is flushed once more on the way out.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => journey.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') journey.flush();
  });
}
