import type { CalendarEvent, MetadataEntry } from '../../../types';

/**
 * Every experimental property the feed publishes shares this prefix. The names below are the
 * only ones the experience reads, so they are declared once here instead of being retyped as
 * string literals at each call site.
 */
export const METADATA_PREFIX = 'X-ACTIONPOP-';

export const METADATA_EVENT_ID = `${METADATA_PREFIX}EVENT-ID`;
export const METADATA_EVENT_TYPE = `${METADATA_PREFIX}EVENT-TYPE`;
export const METADATA_GROUP = `${METADATA_PREFIX}GROUP`;
export const METADATA_SOURCE_URL = `${METADATA_PREFIX}SOURCE-URL`;
export const METADATA_UPDATED_AT = `${METADATA_PREFIX}UPDATED-AT`;

/**
 * Values published under one property name, in declaration order. Surrounding spaces come from
 * the calendar line folding, so they are always trimmed; an empty value means "not published"
 * and an identifier published twice must not be counted twice.
 */
export function metadataValues(entries: readonly MetadataEntry[], name: string): string[] {
  const values: string[] = [];
  for (const entry of entries) {
    if (entry.name !== name) continue;
    const value = entry.value.trim();
    if (value !== '' && !values.includes(value)) values.push(value);
  }
  return values;
}

/** First published value of a property, or `null` when it is absent or empty. */
export function metadataValue(entries: readonly MetadataEntry[], name: string): string | null {
  return metadataValues(entries, name)[0] ?? null;
}

/** Organising groups of one event, without duplicates. */
export function groupIds(event: CalendarEvent): string[] {
  return metadataValues(event.metadata, METADATA_GROUP);
}

/** Organising groups of a whole feed, in first-seen order, without duplicates. */
export function groupIdsOf(events: readonly CalendarEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    for (const id of groupIds(event)) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/** Number of events each group appears on, so the filter can rank groups by activity. */
export function groupCountsOf(events: readonly CalendarEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    for (const id of groupIds(event)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** Whether the event is organised by at least one of the given groups. */
export function hasAnyGroup(event: CalendarEvent, selected: readonly string[]): boolean {
  return groupIds(event).some((id) => selected.includes(id));
}
