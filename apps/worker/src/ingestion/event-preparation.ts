import {
  enrichEventGeography,
  validateEventType,
  type ActionPopulaireEventPayload,
  type EventTypeReader,
  type GeographicReferenceReader,
  type IncomingEvent,
} from '@actionpop/core';

import { toIncomingEvent, toRawLocationFields } from './event-mapper.js';

export class EventTypeValidationError extends Error {
  public constructor(message: string) {
    super(`event type validation failed: ${message}`);
    this.name = 'EventTypeValidationError';
  }
}

export interface EventPreparationDependencies {
  readonly eventTypes: EventTypeReader;
  readonly geographicReference: GeographicReferenceReader;
}

/**
 * Turns one validated source event into the published shape: the event type must be
 * known, the location is enriched, and the groups the source states become attribution.
 * Shared by both ingestion kinds so a listing and a detail cannot diverge.
 */
export async function prepareIncomingEvent(
  event: ActionPopulaireEventPayload,
  deps: EventPreparationDependencies,
): Promise<IncomingEvent> {
  const typeValidation = await validateEventType(event.subtype?.label, deps.eventTypes);
  const blocking = typeValidation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (blocking.length > 0) {
    throw new EventTypeValidationError(
      blocking.map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`).join('; '),
    );
  }

  const geography = await enrichEventGeography(
    toRawLocationFields(event),
    deps.geographicReference,
  );
  return toIncomingEvent(event, geography, typeValidation.eventType);
}
