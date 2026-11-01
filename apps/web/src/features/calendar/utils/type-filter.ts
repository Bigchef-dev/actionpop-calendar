import type { CalendarEvent } from '../../../types';

export interface AvailableType {
  slug: string;
  count: number;
}

/** Sorted list of the action types present in the events, with their counts. */
export function availableTypes(events: readonly CalendarEvent[]): AvailableType[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.eventType === null) continue;
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((left, right) => right.count - left.count || left.slug.localeCompare(right.slug, 'fr'));
}

/**
 * Client-side type filter. An empty selection keeps every event; with a selection active, an
 * event without a type is hidden, and an unknown slug simply matches nothing.
 */
export function filterByType(
  events: readonly CalendarEvent[],
  types: readonly string[],
): CalendarEvent[] {
  if (types.length === 0) return [...events];
  const selected = new Set(types);
  return events.filter((event) => event.eventType !== null && selected.has(event.eventType));
}

/** Human period of the displayed events: one day reads as a single date. */
export function formatPeriod(period: { from: Date; to: Date } | null): string {
  if (period === null) return '';
  const day = (date: Date): string =>
    date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const from = day(period.from);
  const to = day(period.to);
  return from === to ? `Le ${from}` : `Du ${from} au ${to}`;
}

/** First and last start of the displayed events, used to state the covered period. */
export function feedPeriod(events: readonly CalendarEvent[]): { from: Date; to: Date } | null {
  if (events.length === 0) return null;
  let from = events[0]!.start;
  let to = events[0]!.start;
  for (const event of events) {
    if (event.start < from) from = event.start;
    if (event.start > to) to = event.start;
  }
  return { from, to };
}
