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
