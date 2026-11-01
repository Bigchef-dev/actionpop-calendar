import { describe, expect, it } from 'vitest';

import type { MetadataEntry } from '../../src/types';
import {
  formatMetadataValue,
  labelledMetadata,
  metadataLabel,
  readableSlug,
} from '../../src/features/calendar/utils/metadata-labels';

function entry(
  name: string,
  value: string,
  parameters: Record<string, string> = {},
): MetadataEntry {
  return { name, value, parameters };
}

describe('metadataLabel', () => {
  it('translates known properties and keeps unknown ones raw', () => {
    expect(metadataLabel('X-ACTIONPOP-EVENT-TYPE')).toBe('Type d’action');
    expect(metadataLabel('X-ACTIONPOP-NOUVEAU')).toBe('X-ACTIONPOP-NOUVEAU');
  });
});

describe('labelledMetadata', () => {
  it('groups repeated properties and shows parameters as qualifiers', () => {
    const groups = labelledMetadata([
      entry('X-ACTIONPOP-GROUP', 'npa-lyon'),
      entry('X-ACTIONPOP-GROUP', 'attac-69'),
      entry('X-ACTIONPOP-GEO-DIAGNOSTIC', 'two matches', { CODE: 'commune_ambiguous' }),
    ]);

    const groupsOfGroups = groups.find((group) => group.label === 'Groupe organisateur');
    expect(groupsOfGroups?.values.map((value) => value.value)).toEqual(['npa-lyon', 'attac-69']);

    const diagnostic = groups.find((group) => group.label === 'Diagnostic géographique');
    expect(diagnostic?.values[0]?.qualifiers).toEqual(['CODE=commune_ambiguous']);
  });

  it('omits an empty value instead of leaving an empty row', () => {
    expect(labelledMetadata([entry('X-ACTIONPOP-RAW-COMMUNE', '')])).toEqual([]);
  });
});

describe('readableSlug', () => {
  it('turns a slug into a readable name', () => {
    expect(readableSlug('diffusion-tracts')).toBe('Diffusion tracts');
  });
});

describe('formatMetadataValue', () => {
  it('turns the published update instant into a French date', () => {
    const formatted = formatMetadataValue('X-ACTIONPOP-UPDATED-AT', '20261101T153518Z');
    expect(formatted).toContain('novembre');
    expect(formatted).toContain('2026');
  });

  it('turns an action-type slug into a readable name', () => {
    expect(formatMetadataValue('X-ACTIONPOP-EVENT-TYPE', 'reunion-groupe')).toBe('Reunion groupe');
  });

  it('keeps any other value as published', () => {
    expect(formatMetadataValue('X-ACTIONPOP-GROUP', 'npa-lyon')).toBe('npa-lyon');
    expect(formatMetadataValue('X-ACTIONPOP-UPDATED-AT', 'pas une date')).toBe('pas une date');
  });
});
