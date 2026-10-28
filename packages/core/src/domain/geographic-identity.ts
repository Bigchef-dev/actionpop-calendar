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

export function normalizeCountryCode(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

export function normalizeDepartmentCode(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return normalized === '' ? undefined : normalized;
}
