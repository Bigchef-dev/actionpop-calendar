import type { Component } from 'ical.js';

import type { EventStatus, MetadataEntry } from '../../../types';

export const METADATA_PREFIX = 'X-ACTIONPOP-';

interface TextValue {
  toString(): string;
}

interface DateValue {
  toJSDate(): Date;
  isDate?: boolean;
}

export function readText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (Array.isArray(value)) return readText(value[0]);
  if (value !== null && typeof value === 'object' && 'toString' in value) {
    const text = (value as TextValue).toString().trim();
    return text === '' ? null : text;
  }
  return null;
}

export function readDateValue(value: unknown): { date: Date; allDay: boolean } | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = value as Partial<DateValue>;
  if (typeof candidate.toJSDate !== 'function') return null;
  try {
    return { date: candidate.toJSDate(), allDay: candidate.isDate === true };
  } catch {
    return null;
  }
}

export function readStatus(component: InstanceType<typeof Component>): EventStatus {
  const raw = readText(component.getFirstPropertyValue('status'))?.toUpperCase();
  if (raw === 'TENTATIVE') return 'TENTATIVE';
  if (raw === 'CANCELLED') return 'CANCELLED';
  return 'CONFIRMED';
}

export function readEventType(component: InstanceType<typeof Component>): string | null {
  const fromMetadata = readMetadataValue(component, 'EVENT-TYPE');
  if (fromMetadata !== null) return fromMetadata;
  const categories = readText(component.getFirstPropertyValue('categories'));
  if (categories === null) return null;
  const first = categories.split(',')[0]?.trim() ?? '';
  return first === '' ? null : first;
}

export function readSourceUrl(
  component: InstanceType<typeof Component>,
  metadata: readonly MetadataEntry[],
): string | null {
  const fromMetadata = metadata.find((entry) => entry.name === `${METADATA_PREFIX}SOURCE-URL`);
  if (fromMetadata !== undefined && fromMetadata.value !== '') return fromMetadata.value;
  return readText(component.getFirstPropertyValue('url'));
}

export function readCoordinates(
  component: InstanceType<typeof Component>,
): { latitude: number; longitude: number } | null {
  const raw = component.getFirstProperty('geo')?.getFirstValue();
  if (raw === null || raw === undefined) return null;

  const numbers = Array.isArray(raw)
    ? raw.map((value) => Number(value))
    : String(raw)
        .split(/[;,]/)
        .map((value) => Number(value.trim()));

  const latitude = numbers[0];
  const longitude = numbers[1];
  if (latitude === undefined || longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function readMetadata(component: InstanceType<typeof Component>): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  for (const property of component.getAllProperties()) {
    const name = property.name.toUpperCase();
    if (!name.startsWith(METADATA_PREFIX)) continue;
    entries.push({
      name,
      value: readText(property.getFirstValue()) ?? '',
      parameters: readParameters(property),
    });
  }
  return entries;
}

export function readMetadataValue(
  component: InstanceType<typeof Component>,
  attribute: string,
): string | null {
  const property = component.getFirstProperty(`${METADATA_PREFIX}${attribute}`);
  return property === null ? null : readText(property.getFirstValue());
}

function readParameters(property: unknown): Record<string, string> {
  const jCal = (property as { jCal?: unknown }).jCal;
  if (!Array.isArray(jCal)) return {};
  const raw = jCal[1];
  if (raw === null || typeof raw !== 'object') return {};

  const parameters: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    parameters[key.toUpperCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return parameters;
}
