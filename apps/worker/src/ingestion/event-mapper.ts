import {
  normalizeEventType,
  toObservedGroups,
  type ActionPopulaireEventPayload,
  type GeographicAttachment,
  type IncomingEvent,
  type LocationEvent,
  type RawLocationFields,
} from '@actionpop/core';

export function toRawLocationFields(event: ActionPopulaireEventPayload): RawLocationFields {
  const location = event.location;
  return {
    ...(location.country === undefined ? {} : { country: location.country }),
    ...(location.departement === undefined ? {} : { departement: location.departement }),
    ...(location.commune?.name === undefined ? {} : { communeName: location.commune.name }),
    ...(location.city === undefined ? {} : { city: location.city }),
    ...(location.zip === undefined ? {} : { zip: location.zip }),
  };
}

/**
 * Maps one validated source event to the published shape. The groups the source
 * states become the event's attribution; identifiers that trim to empty are
 * dropped and counted instead of failing the whole listing.
 */
export function toIncomingEvent(
  event: ActionPopulaireEventPayload,
  geography: GeographicAttachment,
  validatedEventType?: string,
): IncomingEvent {
  const location: LocationEvent | null =
    event.location === null
      ? null
      : {
          ...(event.location.name === undefined ? {} : { name: event.location.name }),
          ...(event.location.address === undefined ? {} : { address: event.location.address }),
          ...(event.location.address1 === undefined ? {} : { address1: event.location.address1 }),
          ...(event.location.address2 === null || event.location.address2 === undefined
            ? {}
            : { address2: event.location.address2 }),
          ...(event.location.zip === undefined ? {} : { zip: event.location.zip }),
          ...(event.location.city === undefined ? {} : { city: event.location.city }),
          ...(event.location.shortAddress === undefined
            ? {}
            : { shortAddress: event.location.shortAddress }),
          ...(event.location.shortLocation === undefined
            ? {}
            : { shortLocation: event.location.shortLocation }),
          ...(event.location.coordinates === null || event.location.coordinates === undefined
            ? {}
            : { coordinates: event.location.coordinates }),
        };

  const observed = toObservedGroups(event.groups ?? []);
  const eventType = validatedEventType ?? normalizeEventType(event.subtype?.label);

  return {
    id: event.id,
    name: event.name,
    startTime: event.startTime,
    endTime: event.endTime,
    ...(event.description === undefined ? {} : { description: event.description }),
    location,
    geography,
    groups: observed.groups,
    ...(observed.blankIdentifiers === 0
      ? {}
      : { blankGroupIdentifiers: observed.blankIdentifiers }),
    ...(eventType === undefined ? {} : { eventType }),
  };
}
