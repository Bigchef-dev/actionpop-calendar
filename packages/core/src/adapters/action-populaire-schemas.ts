import { z } from 'zod';

import { PayloadValidationError } from '../operations/errors.js';
import type { GeoPoint } from '../domain/types.js';

const isoTimestampSchema = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !Number.isNaN(Date.parse(value)),
    'must be an ISO 8601 timestamp with an explicit timezone',
  );

const sourceTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'must be a valid IANA timezone');

const optionalText = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().trim().min(1).optional(),
);

const coordinateSchema = z
  .object({
    type: z.literal('Point'),
    coordinates: z.tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ]),
  })
  .strip();

export const MAP_EVENT_HINT_FIELDS = [
  'name',
  'coordinates',
  'date',
  'link',
  'start_time',
  'end_time',
  'subtype',
] as const;

export type MapEventHintField = (typeof MAP_EVENT_HINT_FIELDS)[number];

export interface MapEventSummary {
  readonly id: string;
  readonly name?: string;
  readonly coordinates?: GeoPoint;
  readonly date?: string;
  readonly link?: string;
  readonly start_time?: string;
  readonly end_time?: string;
  readonly subtype?: number;
}

export const mapEventIdSchema = z.string().trim().min(1);

export const mapEventHintSchemas = {
  name: z.string().trim().min(1),
  coordinates: coordinateSchema,
  date: z.string().trim().min(1),
  link: z.string().url(),
  start_time: isoTimestampSchema,
  end_time: isoTimestampSchema,
  subtype: z.number().int(),
} satisfies Record<MapEventHintField, z.ZodType>;

export const mapEventSummarySchema = z
  .object({
    id: mapEventIdSchema,
    name: mapEventHintSchemas.name.optional(),
    coordinates: mapEventHintSchemas.coordinates.nullable().optional(),
    date: mapEventHintSchemas.date.optional(),
    link: mapEventHintSchemas.link.optional(),
    start_time: mapEventHintSchemas.start_time.optional(),
    end_time: mapEventHintSchemas.end_time.optional(),
    subtype: mapEventHintSchemas.subtype.optional(),
  })
  .strip();

const communeSchema = z
  .object({
    name: optionalText,
    nameOf: optionalText,
  })
  .strip();

const locationSchema = z
  .object({
    name: optionalText,
    address: optionalText,
    address1: optionalText,
    address2: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).nullable().optional(),
    ),
    zip: optionalText,
    city: optionalText,
    departement: optionalText,
    country: optionalText,
    commune: z.preprocess(
      (value) => (value === null || value === '' ? undefined : value),
      communeSchema.optional(),
    ),
    shortAddress: optionalText,
    shortLocation: optionalText,
    coordinates: coordinateSchema.nullable().optional(),
  })
  .strip();

// A group name is presentation only: an absent, blank or unreadable value falls back
// to the identifier instead of failing the whole listing.
const optionalGroupName = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined),
  z.string().optional(),
);

// A blank identifier is a data-quality gap of the payload, not a reason to reject the
// event: `toObservedGroups` drops and counts it before anything is persisted.
const eventGroupSchema = z
  .object({
    id: z.string().trim(),
    name: optionalGroupName,
  })
  .strip();

const eventSubtypeSchema = z
  .object({
    id: z.number().int().optional(),
    label: optionalText,
  })
  .strip();

const actionPopulaireEventSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    startTime: isoTimestampSchema,
    endTime: isoTimestampSchema,
    timezone: sourceTimezoneSchema,
    location: locationSchema,
    groups: z.array(eventGroupSchema).default([]),
    description: optionalText,
    subtype: z.preprocess(
      (value) => (value === null || value === '' ? undefined : value),
      eventSubtypeSchema.optional(),
    ),
  })
  .strip();

const groupCatalogueEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    is_active: z.boolean(),
    coordinates: coordinateSchema.nullable().optional(),
    type: optionalText,
    subtype: z
      .union([z.string().trim().min(1), z.number()])
      .nullable()
      .optional(),
    subtypes: z.array(z.number().int()).optional(),
    is_certified: z.boolean().optional(),
    location_country: optionalText,
    link: optionalText,
    filter: optionalText,
  })
  .strip();

export type ActionPopulaireLocation = z.output<typeof locationSchema>;
export type ActionPopulaireEventPayload = z.output<typeof actionPopulaireEventSchema>;
export type GroupCatalogueEntry = z.output<typeof groupCatalogueEntrySchema>;

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || label} ${issue.message}`)
    .join('; ');
  throw new PayloadValidationError(`${label}: ${details}`);
}

export interface MapEventSummaryParse {
  readonly summary?: MapEventSummary;
  readonly droppedHints: readonly MapEventHintField[];
}

/**
 * Identity-first entry validation: only an unusable identity rejects the entry.
 * Each optional hint is validated alone, so one malformed value never hides a
 * valid event from discovery. The detail document remains authoritative.
 */
export function parseMapEventSummaryEntry(value: unknown): MapEventSummaryParse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { droppedHints: [] };
  }
  const record = value as Record<string, unknown>;
  const identity = mapEventIdSchema.safeParse(record.id);
  if (!identity.success) return { droppedHints: [] };

  const droppedHints: MapEventHintField[] = [];
  const summary: {
    id: string;
    name?: string;
    coordinates?: GeoPoint;
    date?: string;
    link?: string;
    start_time?: string;
    end_time?: string;
    subtype?: number;
  } = { id: identity.data };

  const name = mapEventHintSchemas.name.safeParse(record.name);
  if (name.success) {
    summary.name = name.data;
  } else if (record.name !== undefined && record.name !== null) {
    droppedHints.push('name');
  }

  if (record.coordinates !== undefined && record.coordinates !== null) {
    const coordinates = mapEventHintSchemas.coordinates.safeParse(record.coordinates);
    if (coordinates.success) summary.coordinates = coordinates.data;
    else droppedHints.push('coordinates');
  }

  const date = mapEventHintSchemas.date.safeParse(record.date);
  if (date.success) {
    summary.date = date.data;
  } else if (record.date !== undefined && record.date !== null) {
    droppedHints.push('date');
  }

  const link = mapEventHintSchemas.link.safeParse(record.link);
  if (link.success) {
    summary.link = link.data;
  } else if (record.link !== undefined && record.link !== null) {
    droppedHints.push('link');
  }

  const startTime = mapEventHintSchemas.start_time.safeParse(record.start_time);
  if (startTime.success) {
    summary.start_time = startTime.data;
  } else if (record.start_time !== undefined && record.start_time !== null) {
    droppedHints.push('start_time');
  }

  const endTime = mapEventHintSchemas.end_time.safeParse(record.end_time);
  if (endTime.success) {
    summary.end_time = endTime.data;
  } else if (record.end_time !== undefined && record.end_time !== null) {
    droppedHints.push('end_time');
  }

  const subtype = mapEventHintSchemas.subtype.safeParse(record.subtype);
  if (subtype.success) {
    summary.subtype = subtype.data;
  } else if (record.subtype !== undefined && record.subtype !== null) {
    droppedHints.push('subtype');
  }

  if (
    summary.start_time !== undefined &&
    summary.end_time !== undefined &&
    Date.parse(summary.end_time) < Date.parse(summary.start_time)
  ) {
    delete summary.end_time;
    droppedHints.push('end_time');
  }

  return { summary, droppedHints };
}

export function validateActionPopulaireEvent(value: unknown): ActionPopulaireEventPayload {
  return parseSchema(actionPopulaireEventSchema, value, 'event');
}

export function validateGroupCatalogue(value: unknown): GroupCatalogueEntry[] {
  return parseSchema(z.array(groupCatalogueEntrySchema), value, 'group catalogue');
}

export type ActionPopulaireGeoPoint = GeoPoint;
