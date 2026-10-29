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
 * The source publishes free-form labels (`fête-locale`, `Événement ILB`), so a label
 * becomes the canonical slug used in storage, filters and the calendar: accents are
 * folded, case lowered and punctuation collapsed to hyphens.
 */
export function normalizeEventType(rawLabel: string | undefined): string | undefined {
  const raw = rawLabel?.trim();
  if (raw === undefined || raw === '') return undefined;

  const slug = raw
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug === '' ? undefined : slug;
}

/**
 * The source owns an extensible enum that cannot be enumerated locally, so a label is
 * normalized, then accepted and registered on first sight. Only a label with no usable
 * characters is rejected, which keeps a platform addition from breaking ingestion.
 */
export async function validateEventType(
  rawLabel: string | undefined,
  reader: EventTypeReader,
): Promise<EventTypeValidation> {
  const stated = rawLabel?.trim();
  if (stated === undefined || stated === '') return { diagnostics: [] };

  const eventType = normalizeEventType(stated);
  if (eventType === undefined || !EVENT_TYPE_PATTERN.test(eventType)) {
    return {
      diagnostics: [
        {
          code: 'event_type_invalid',
          field: 'subtype.label',
          message: `"${stated}" cannot be normalized into an event-type label (expected letters, digits and hyphens)`,
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
