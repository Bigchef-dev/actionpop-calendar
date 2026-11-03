import { sendJourneyPayload } from './send';
import { createVisitTracker, type VisitTracker } from './visit';

/** The journey vocabulary, mirrored from `apps/api/src/observability/journey-events.ts`. */
export const JOURNEY_STEPS = [
  'arrival',
  'search',
  'search_empty',
  'subject_selected',
  'suggestion_accepted',
  'calendar_shown',
  'type_filter',
  'group_filter',
  'detail_opened',
  'export',
  'subscribe',
] as const;

export type JourneyStep = (typeof JOURNEY_STEPS)[number];

export const JOURNEY_SUBJECT_KINDS = ['commune', 'department', 'group', 'epci', 'none'] as const;

export type JourneySubjectKind = (typeof JOURNEY_SUBJECT_KINDS)[number];

/** Steps whose click usually unloads the page, so the batch must leave with the navigation. */
const UNLOAD_SAFE_STEPS: ReadonlySet<JourneyStep> = new Set(['export', 'subscribe']);

const MAX_BATCH_STEPS = 10;
const FLUSH_INTERVAL_MS = 2000;

export interface JourneyReporter {
  readonly track: (step: JourneyStep, subjectKind?: JourneySubjectKind) => void;
  readonly flush: () => void;
}

interface PendingStep {
  readonly s: JourneyStep;
  readonly k?: JourneySubjectKind;
}

export interface JourneyReporterOptions {
  readonly enabled?: boolean;
  readonly visits?: VisitTracker;
  readonly send?: typeof sendJourneyPayload;
  readonly schedule?: (callback: () => void, delayMs: number) => number;
}

/**
 * Collects journey steps and sends them in small batches.
 *
 * Nothing here is awaited by a caller: an interaction enqueues and returns immediately, so a slow
 * network or a blocked endpoint can never delay the calendar.
 */
export function createJourneyReporter(options: JourneyReporterOptions = {}): JourneyReporter {
  if (options.enabled === false) {
    return { track: () => undefined, flush: () => undefined };
  }

  const visits = options.visits ?? createVisitTracker();
  const send = options.send ?? sendJourneyPayload;
  const schedule =
    options.schedule ??
    ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs) as unknown as number);
  let pending: PendingStep[] = [];
  let timer: number | null = null;

  const flushWith = (unloadSafe: boolean): void => {
    if (pending.length === 0) return;
    const steps = pending.slice(0, MAX_BATCH_STEPS);
    pending = pending.slice(steps.length);
    send({ v: 1, visit: visits.current().id, steps }, unloadSafe);
  };

  const flush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    flushWith(false);
  };

  const track = (step: JourneyStep, subjectKind?: JourneySubjectKind): void => {
    const isArrival = step === 'arrival';
    // An arrival only counts when the visit actually started: a second tab, or a page that is
    // already part of an active visit, must not inflate the visit count.
    if (isArrival && !visits.start()) return;
    if (!isArrival) visits.start();

    pending.push(subjectKind === undefined ? { s: step } : { s: step, k: subjectKind });

    if (UNLOAD_SAFE_STEPS.has(step)) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      flushWith(true);
      return;
    }

    if (pending.length >= MAX_BATCH_STEPS) {
      flush();
      return;
    }
    if (timer === null) {
      timer = schedule(() => {
        timer = null;
        flushWith(false);
      }, FLUSH_INTERVAL_MS);
    }
  };

  return { track, flush };
}
