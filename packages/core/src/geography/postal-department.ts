/**
 * Department implied by a French postal code. Arrondissement-level and generic codes are
 * accepted because the department prefix, not a commune attachment, is all that is derived.
 */
export function departmentFromPostalCode(zip: string | undefined): string | undefined {
  const value = zip?.trim();
  if (value === undefined || !/^\d{5}$/.test(value)) return undefined;

  if (value.startsWith('97')) {
    return value.slice(0, 3);
  }
  if (value.startsWith('20')) {
    return Number(value) <= 20190 ? '2A' : '2B';
  }
  return value.slice(0, 2);
}
