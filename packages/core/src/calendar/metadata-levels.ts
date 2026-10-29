export const METADATA_LEVELS = ['off', 'identity', 'standard', 'full'] as const;

export type MetadataLevel = (typeof METADATA_LEVELS)[number];

export const METADATA_FAMILIES = [
  'identity',
  'classification',
  'provenance',
  'geography',
  'diagnostics',
  'raw_source',
] as const;

export type MetadataFamily = (typeof METADATA_FAMILIES)[number];

const LEVEL_RANK: Record<MetadataLevel, number> = {
  off: 0,
  identity: 1,
  standard: 2,
  full: 3,
};

const FAMILY_RANK: Record<MetadataFamily, number> = {
  identity: 1,
  classification: 2,
  provenance: 2,
  geography: 3,
  diagnostics: 3,
  raw_source: 3,
};

export function isMetadataFamilyEmitted(
  level: MetadataLevel,
  family: MetadataFamily,
  disabledFamilies: readonly MetadataFamily[] = [],
): boolean {
  if (level === 'off') return false;
  if (disabledFamilies.includes(family)) return false;
  return LEVEL_RANK[level] >= FAMILY_RANK[family];
}
