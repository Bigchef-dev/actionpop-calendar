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

export const JOURNEY_SUBJECT_KINDS = [
  'commune',
  'department',
  'group',
  'epci',
  'none',
] as const;

export type JourneySubjectKind = (typeof JOURNEY_SUBJECT_KINDS)[number];

export const MAX_STEPS_PER_BATCH = 10;
export const MAX_BODY_BYTES = 2000;
const VISIT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface JourneyStepEntry {
  readonly step: JourneyStep;
  readonly subjectKind: JourneySubjectKind;
}

export interface JourneyBatch {
  readonly visit: string;
  readonly steps: readonly JourneyStepEntry[];
  /** Accepted steps whose name was outside the vocabulary; counted, then dropped. */
  readonly unknownSteps: number;
  readonly malformedSteps: number;
}

export type JourneyRejection = 'malformed' | 'too_large' | 'wrong_type';

export type JourneyParseResult =
  | { readonly ok: true; readonly batch: JourneyBatch }
  | { readonly ok: false; readonly reason: JourneyRejection };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function subjectKindOf(value: unknown): JourneySubjectKind {
  return (JOURNEY_SUBJECT_KINDS as readonly string[]).includes(String(value))
    ? (String(value) as JourneySubjectKind)
    : 'none';
}

/**
 * Parses one telemetry batch. The body is untrusted and public, so every field is checked and the
 * only outcomes are a bounded batch or a bounded rejection reason: nothing the caller sent is ever
 * echoed back or logged.
 */
export function parseJourneyBatch(body: string): JourneyParseResult {
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!isRecord(parsed) || parsed.v !== 1) return { ok: false, reason: 'malformed' };

  const visit = parsed.visit;
  if (typeof visit !== 'string' || !VISIT_PATTERN.test(visit)) {
    return { ok: false, reason: 'malformed' };
  }

  const rawSteps = parsed.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0 || rawSteps.length > MAX_STEPS_PER_BATCH) {
    return { ok: false, reason: 'malformed' };
  }

  const steps: JourneyStepEntry[] = [];
  let unknownSteps = 0;
  let malformedSteps = 0;

  for (const raw of rawSteps) {
    if (!isRecord(raw) || typeof raw.s !== 'string') {
      malformedSteps += 1;
      continue;
    }
    if (!(JOURNEY_STEPS as readonly string[]).includes(raw.s)) {
      unknownSteps += 1;
      continue;
    }
    steps.push({ step: raw.s as JourneyStep, subjectKind: subjectKindOf(raw.k) });
  }

  // A batch of only unknown steps is still well formed: the visitor behaved, our vocabulary is
  // simply older than theirs, and that is worth counting rather than rejecting.
  return { ok: true, batch: { visit, steps, unknownSteps, malformedSteps } };
}

/** Accepts `application/json` with any charset suffix; anything else is refused before parsing. */
export function isJsonContentType(header: string | undefined): boolean {
  if (header === undefined) return false;
  return header.split(';')[0]?.trim().toLowerCase() === 'application/json';
}
