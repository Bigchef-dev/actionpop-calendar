export function normalizeCommuneKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
}

export function normalizeGeographicName(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Comparison key of a place name, used both when a reference is imported and when a query
 * is read.
 *
 * A doubled letter carries no distinguishing meaning in a place name, so it is collapsed:
 * "Rennes" and "Renes" share one key. Applying this on both sides is what makes the rule
 * safe; applied to the query alone it would hide every place whose name actually has the
 * doubled letter.
 */
export function normalizeNameForSearch(value: string): string {
  return normalizeGeographicName(value).replace(/([a-z])\1+/g, '$1');
}

export function normalizeCountryCode(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

export function normalizeDepartmentCode(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return normalized === '' ? undefined : normalized;
}
