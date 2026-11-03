import { Prisma } from '@prisma/client';

import type { PublishedEvent } from '../models/event.interface.js';
import type { RegistryClient } from './postgres-group-registry.js';

/**
 * Writes the event row and its address. Identity is the source identifier, so
 * re-ingesting the same event updates the same row and keeps its sequence.
 */
export async function upsertEventRecord(
  transaction: RegistryClient,
  event: PublishedEvent,
): Promise<void> {
  const locationId = await upsertEventLocation(transaction, event);

  await transaction.eventRecord.upsert({
    where: { sourceEventId: event.sourceEventId },
    create: {
      sourceEventId: event.sourceEventId,
      locationId,
      summary: event.name,
      description: event.description ?? null,
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
      contentHash: event.contentHash,
      sequence: event.sequence,
      status: event.status ?? 'ACTIVE',
      timezone: 'Europe/Paris',
      ...geographyColumns(event),
    },
    update: {
      locationId,
      summary: event.name,
      description: event.description ?? null,
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
      contentHash: event.contentHash,
      sequence: event.sequence,
      status: event.status ?? 'ACTIVE',
      ...geographyColumns(event),
    },
  });
}

/**
 * Stores the event address under a stable, event-scoped key and returns it, or
 * null when the source states no location. The address is not part of the event
 * identity, so re-ingesting the same event updates the same row.
 */
async function upsertEventLocation(
  transaction: RegistryClient,
  event: PublishedEvent,
): Promise<string | null> {
  const locationId = `event:${event.sourceEventId}`;
  const location = event.location;
  if (location === null) {
    await transaction.geoPoint.deleteMany({ where: { locationId } });
    await transaction.locationRecord.deleteMany({ where: { locationId } });
    return null;
  }

  const data = {
    ownerType: 'EVENT',
    name: location.name ?? null,
    address1: location.address1 ?? null,
    address2: location.address2 ?? null,
    zip: location.zip ?? null,
    city: location.city ?? null,
    fullAddress: location.address ?? null,
    shortAddress: location.shortAddress ?? location.shortLocation ?? null,
  };

  await transaction.locationRecord.upsert({
    where: { locationId },
    create: { locationId, ...data },
    update: data,
  });

  const coordinates = location.coordinates;
  if (coordinates === undefined || coordinates === null) {
    await transaction.geoPoint.deleteMany({ where: { locationId } });
    return locationId;
  }

  const [longitude, latitude] = coordinates.coordinates;
  await transaction.geoPoint.upsert({
    where: { locationId },
    create: { locationId, type: 'Point', longitude, latitude },
    update: { type: 'Point', longitude, latitude },
  });

  return locationId;
}

function geographyColumns(event: PublishedEvent) {
  const geography = event.geography;
  if (geography === undefined) return {};

  return {
    referenceVersion: geography.referenceVersion ?? null,
    geographicStatus: geography.geographicStatus,
    countryCode: geography.countryCode ?? null,
    departmentCode: geography.departmentCode ?? null,
    departmentSource: geography.departmentSource ?? null,
    rawDepartmentCode: geography.rawDepartmentCode ?? null,
    rawCommuneName: geography.rawCommuneName ?? null,
    communeId: geography.communeId ?? null,
    geographicDiagnostics: toJsonValue(geography.diagnostics),
    ...(event.eventType === undefined ? {} : { eventType: event.eventType }),
  };
}

// Prisma's JSON input types require an index signature that domain records do not have;
// the assertion is a narrow persistence-boundary conversion of already-validated data.
function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
