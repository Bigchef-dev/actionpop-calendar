import type { MetadataEntry } from '../../../types';
import { METADATA_EVENT_TYPE, METADATA_PREFIX, METADATA_UPDATED_AT } from './metadata';

/** French labels keyed by property name without its prefix, which `metadataLabel` strips. */
const LABELS: Record<string, string> = {
  'EVENT-ID': 'Identifiant de l’action',
  'UPDATED-AT': 'Dernière mise à jour',
  PERIOD: 'Période de traitement',
  'EVENT-TYPE': 'Type d’action',
  'SOURCE-URL': 'Page Action Populaire',
  GROUP: 'Groupe organisateur',
  'GEO-STATUS': 'Statut géographique',
  COUNTRY: 'Pays',
  DEPARTMENT: 'Département',
  'INSEE-COMMUNE': 'Commune (code INSEE)',
  'GEO-REFERENCE': 'Référentiel géographique',
  'GEO-DIAGNOSTIC-COUNT': 'Nombre de diagnostics',
  'GEO-DIAGNOSTIC': 'Diagnostic géographique',
  'RAW-DEPARTMENT': 'Département tel que publié',
  'RAW-COMMUNE': 'Commune telle que publiée',
};

export interface MetadataValue {
  value: string;
  qualifiers: string[];
}

export interface MetadataGroup {
  label: string;
  values: MetadataValue[];
}

/** French label of a published property; an unknown one is shown as its raw name. */
export function metadataLabel(name: string): string {
  const key = name.startsWith(METADATA_PREFIX) ? name.slice(METADATA_PREFIX.length) : name;
  return LABELS[key] ?? name;
}

function qualifiersOf(entry: MetadataEntry): string[] {
  return Object.entries(entry.parameters).map(([key, value]) => `${key}=${value}`);
}

/**
 * Groups the published extra fields for display, keeping declaration order. A repeated property
 * (`GROUP`, `GEO-DIAGNOSTIC`) becomes one labelled group with several values; an absent property
 * never produces an entry, so the section can simply render nothing.
 */
export function labelledMetadata(entries: readonly MetadataEntry[]): MetadataGroup[] {
  const groups: MetadataGroup[] = [];
  for (const entry of entries) {
    if (entry.value === '') continue;
    const label = metadataLabel(entry.name);
    const value: MetadataValue = {
      value: formatMetadataValue(entry.name, entry.value),
      qualifiers: qualifiersOf(entry),
    };
    const existing = groups.find((group) => group.label === label);
    if (existing === undefined) {
      groups.push({ label, values: [value] });
      continue;
    }
    existing.values.push(value);
  }
  return groups;
}

/**
 * Turns a published value into something readable: the update instant becomes a French
 * date and the action type becomes a readable name. Anything else is shown as published.
 */
export function formatMetadataValue(name: string, value: string): string {
  if (name === METADATA_EVENT_TYPE) return readableSlug(value);
  if (name === METADATA_UPDATED_AT) {
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
    if (match !== null) {
      const [, year, month, day, hour, minute] = match;
      const date = new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
      );
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
      }
    }
  }
  return value;
}

/** Slug shown when the action type is published as a raw identifier. */
export function readableSlug(slug: string): string {
  const words = slug.replace(/-/g, ' ').trim();
  return words === '' ? slug : words.charAt(0).toUpperCase() + words.slice(1);
}
