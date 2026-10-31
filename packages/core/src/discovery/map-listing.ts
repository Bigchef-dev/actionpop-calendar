import {
  MAP_EVENT_HINT_FIELDS,
  parseMapEventSummaryEntry,
  type MapEventHintField,
  type MapEventSummary,
} from '../adapters/action-populaire-schemas.js';
import { PayloadValidationError } from '../operations/errors.js';

export interface MapEventListingValidation {
  readonly summaries: readonly MapEventSummary[];
  readonly rejected: number;
  readonly duplicates: number;
  readonly droppedHints: Readonly<Record<MapEventHintField, number>>;
}

function emptyHintCounts(): Record<MapEventHintField, number> {
  return Object.fromEntries(MAP_EVENT_HINT_FIELDS.map((field) => [field, 0])) as Record<
    MapEventHintField,
    number
  >;
}

/**
 * Validates one complete listing without letting one malformed hint hide a
 * discoverable identity. The first occurrence of an identity wins.
 */
export function validateMapEventListing(value: unknown): MapEventListingValidation {
  if (!Array.isArray(value)) {
    throw new PayloadValidationError('map listing: expected an array');
  }

  const droppedHints = emptyHintCounts();
  const summaries = new Map<string, MapEventSummary>();
  let rejected = 0;
  let duplicates = 0;

  for (const entry of value) {
    const parsed = parseMapEventSummaryEntry(entry);
    if (parsed.summary === undefined) {
      rejected += 1;
      continue;
    }
    for (const field of parsed.droppedHints) droppedHints[field] += 1;
    if (summaries.has(parsed.summary.id)) {
      duplicates += 1;
      continue;
    }
    summaries.set(parsed.summary.id, parsed.summary);
  }

  return {
    summaries: [...summaries.values()],
    rejected,
    duplicates,
    droppedHints,
  };
}
