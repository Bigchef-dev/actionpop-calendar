import type { Diagnostic } from './reference-types.js';

export interface ObservedEventType {
  value: string;
  firstSeenAt: string;
  source: string;
}

export interface EventTypeReader {
  findEventType(value: string): Promise<ObservedEventType | null>;
  recordObservedEventTypes(values: string[], source: string): Promise<void>;
}

export interface EventTypeValidation {
  eventType?: string;
  diagnostics: Diagnostic[];
}

const EVENT_TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The source owns an extensible enum that cannot be enumerated locally, so a well-formed
 * label is accepted and registered on first sight. Only a malformed label is rejected,
 * which keeps a platform addition from breaking ingestion while still refusing garbage.
 */
export async function validateEventType(
  rawLabel: string | undefined,
  reader: EventTypeReader,
): Promise<EventTypeValidation> {
  const eventType = rawLabel?.trim();
  if (eventType === undefined || eventType === '') return { diagnostics: [] };

  if (!EVENT_TYPE_PATTERN.test(eventType)) {
    return {
      diagnostics: [
        {
          code: 'event_type_invalid',
          field: 'subtype.label',
          message: `"${eventType}" is not a valid event-type label (expected lowercase words separated by hyphens)`,
          severity: 'error',
        },
      ],
    };
  }

  const observed = await reader.findEventType(eventType);
  if (observed === null) {
    await reader.recordObservedEventTypes([eventType], 'action-populaire');
  }

  return { eventType, diagnostics: [] };
}
