import type { MetricsRegistry } from '@actionpop/core';

import { clientKind, type ClientKind } from './client-kind.js';

export const CALENDAR_SUBJECT_KINDS = [
  'commune',
  'department',
  'group',
  'epci',
  'multi',
  'none',
] as const;

export type CalendarSubjectKind = (typeof CALENDAR_SUBJECT_KINDS)[number];

export const DELIVERY_KINDS = ['first', 'revalidated', 'rejected', 'unavailable'] as const;

export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

export const FILTER_KINDS = ['type', 'group'] as const;

export type FilterKind = (typeof FILTER_KINDS)[number];

export const FILTER_CARDINALITIES = ['none', 'one', 'few', 'many'] as const;

export type FilterCardinality = (typeof FILTER_CARDINALITIES)[number];

export const TRUNCATION_REASONS = ['entry_ceiling', 'group_ceiling'] as const;

export type TruncationReason = (typeof TRUNCATION_REASONS)[number];

/** Subject parameters accepted by the calendar route, most specific first. */
const SUBJECT_PARAMETERS = ['insee_commune', 'epci', 'department', 'group'] as const;

/**
 * Derives the territory family from the query parameters without ever keeping the identifier:
 * `insee_commune=35238` becomes `commune`, and a combination becomes `multi`.
 */
export function subjectKindOf(query: Record<string, string | undefined>): CalendarSubjectKind {
  const present = SUBJECT_PARAMETERS.filter((name) => {
    const value = query[name];
    return value !== undefined && value.trim() !== '';
  });

  if (present.length === 0) return 'none';
  if (present.length > 1) return 'multi';
  const [single] = present;
  return single === 'insee_commune' ? 'commune' : (single as CalendarSubjectKind);
}

export function filterCardinality(count: number): FilterCardinality {
  if (count <= 0) return 'none';
  if (count === 1) return 'one';
  if (count <= 5) return 'few';
  return 'many';
}

function countValues(value: string | undefined): number {
  if (value === undefined) return 0;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '').length;
}

/** Both filter families of one accepted request, with cardinality classes instead of values. */
export interface FilterSample {
  readonly filter: FilterKind;
  readonly cardinality: FilterCardinality;
}

export function filterSamples(query: Record<string, string | undefined>): FilterSample[] {
  const candidates: FilterSample[] = [
    { filter: 'type', cardinality: filterCardinality(countValues(query.event_type)) },
    { filter: 'group', cardinality: filterCardinality(countValues(query.group)) },
  ];
  return candidates.filter((sample) => sample.cardinality !== 'none');
}

export interface CalendarDeliverySample {
  readonly subjectKind: CalendarSubjectKind;
  readonly delivery: DeliveryKind;
  readonly clientKind: ClientKind;
}

/** A 304 is a renewal, a 200 a delivery, and a failure is never counted as either. */
export function deliveryKindOf(statusCode: number): DeliveryKind {
  if (statusCode === 304) return 'revalidated';
  if (statusCode === 200) return 'first';
  if (statusCode === 503) return 'unavailable';
  return 'rejected';
}

export interface CalendarRequestObservation {
  readonly query: Record<string, string | undefined>;
  readonly signature: string | undefined;
  readonly statusCode: number;
  readonly truncated?: boolean;
  readonly groupsTruncated?: boolean;
}

/**
 * Records one calendar request using bounded labels only: the territory family, the delivery kind
 * and the client class. The territory identifier and the filter values never reach a series.
 */
export function recordCalendarRequest(
  metrics: MetricsRegistry,
  observation: CalendarRequestObservation,
): void {
  const subjectKind = subjectKindOf(observation.query);
  const delivery = deliveryKindOf(observation.statusCode);

  metrics.increment('actionpop_calendar_requests_total', {
    subject_kind: subjectKind,
    delivery,
    client_kind: clientKind(observation.signature),
  });

  if (delivery !== 'first' && delivery !== 'revalidated') return;

  if (observation.truncated === true) {
    metrics.increment('actionpop_calendar_truncated_total', {
      subject_kind: subjectKind,
      reason: 'entry_ceiling',
    });
  }
  if (observation.groupsTruncated === true) {
    metrics.increment('actionpop_calendar_truncated_total', {
      subject_kind: subjectKind,
      reason: 'group_ceiling',
    });
  }
  for (const sample of filterSamples(observation.query)) {
    metrics.increment('actionpop_calendar_filters_total', {
      filter: sample.filter,
      cardinality: sample.cardinality,
    });
  }
}
