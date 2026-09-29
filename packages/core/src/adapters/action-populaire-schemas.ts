import { z } from 'zod';

import { PayloadValidationError } from '../operations/errors.js';
import type { GeoPoint } from '../domain/types.js';

const isoTimestampSchema = z.string().refine(
  value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value)),
  'must be an ISO 8601 timestamp with an explicit timezone',
);

const optionalText = z.preprocess(
  value => value === '' || value === null ? undefined : value,
  z.string().trim().min(1).optional(),
);

const coordinateSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ]),
}).strip();

const locationSchema = z.object({
  name: optionalText,
  address1: optionalText,
  address2: z.preprocess(
    value => value === '' ? undefined : value,
    z.string().trim().min(1).nullable().optional(),
  ),
  zip: optionalText,
  city: optionalText,
  country: optionalText,
  coordinates: coordinateSchema.nullable().optional(),
}).strip().superRefine((location, context) => {
  if (!location.name && !location.city && !location.address1) {
    context.addIssue({
      code: 'custom',
      message: 'must contain a usable name, city, or address',
    });
  }
});

const eventGroupSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
}).strip();

const actionPopulaireEventSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  startTime: isoTimestampSchema,
  endTime: isoTimestampSchema,
  timezone: z.literal('Europe/Paris'),
  location: locationSchema,
  groups: z.array(eventGroupSchema).default([]),
  description: optionalText,
}).strip();

const groupCatalogueEntrySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  is_active: z.boolean(),
  coordinates: coordinateSchema.nullable().optional(),
  type: optionalText,
  subtype: z.union([z.string().trim().min(1), z.number()]).optional(),
  subtypes: z.array(z.number().int()).optional(),
  is_certified: z.boolean().optional(),
  location_country: optionalText,
  link: optionalText,
  filter: optionalText,
}).strip();

export type ActionPopulaireLocation = z.output<typeof locationSchema>;
export type ActionPopulaireEventPayload = z.output<typeof actionPopulaireEventSchema>;
export type GroupCatalogueEntry = z.output<typeof groupCatalogueEntrySchema>;

function parseSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const details = result.error.issues
    .map(issue => `${issue.path.join('.') || label} ${issue.message}`)
    .join('; ');
  throw new PayloadValidationError(`${label}: ${details}`);
}

export function validateActionPopulaireEvent(value: unknown): ActionPopulaireEventPayload {
  return parseSchema(actionPopulaireEventSchema, value, 'event');
}

export function validateGroupCatalogue(value: unknown): GroupCatalogueEntry[] {
  return parseSchema(z.array(groupCatalogueEntrySchema), value, 'group catalogue');
}

export type ActionPopulaireGeoPoint = GeoPoint;