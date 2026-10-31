import { createHash } from 'node:crypto';

import type { MapEventSummary } from '../adapters/action-populaire-schemas.js';

export interface MapObservationState {
  readonly lastRequestedAt: Date | string | null;
  readonly nextReconcileAt: Date | string | null;
  readonly lastOutcome: string | null;
}

function asDate(value: Date | string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Change detection excludes the presentation-only `date` and `link` fields. */
export function summaryFingerprint(summary: MapEventSummary): string {
  const payload = {
    ...(summary.name === undefined ? {} : { name: summary.name }),
    ...(summary.start_time === undefined ? {} : { start_time: summary.start_time }),
    ...(summary.end_time === undefined ? {} : { end_time: summary.end_time }),
    ...(summary.coordinates === undefined
      ? {}
      : { coordinates: { type: 'Point', coordinates: summary.coordinates.coordinates } }),
    ...(summary.subtype === undefined ? {} : { subtype: summary.subtype }),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** A missing or unparsable end time never counts as ended. */
export function hasEnded(endTime: string | Date | null | undefined, now: Date): boolean {
  const end = asDate(endTime);
  return end !== undefined && end.getTime() <= now.getTime();
}

export function shouldRequestDetail(observation: MapObservationState, now: Date): boolean {
  if (observation.lastRequestedAt === null) return true;
  if (observation.nextReconcileAt === null) return true;
  if (observation.lastOutcome === 'failed' || observation.lastOutcome === 'mismatched') return true;
  const next = asDate(observation.nextReconcileAt);
  return next !== undefined && next.getTime() <= now.getTime();
}
