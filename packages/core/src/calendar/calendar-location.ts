/**
 * Address fields available on an event location, from either the source payload
 * or the persisted location record.
 */
export interface CalendarLocationInput {
  readonly name?: string | null | undefined;
  readonly address1?: string | null | undefined;
  readonly address2?: string | null | undefined;
  readonly zip?: string | null | undefined;
  readonly city?: string | null | undefined;
  readonly shortAddress?: string | null | undefined;
  /** Full address as stated by the source. */
  readonly address?: string | null | undefined;
  /** Full address as stored in the location record. */
  readonly fullAddress?: string | null | undefined;
}

/**
 * Renders the venue of an event as one line for the RFC 5545 `LOCATION`
 * property, in the order a person reads it: the place name, then the postal
 * address.
 *
 * Sources often repeat the locality inside the street line, so the postal code
 * and city are only appended when the street line does not already state them.
 * A place name that merely repeats the city or that the address already contains
 * is dropped rather than duplicated.
 */
export function formatCalendarLocation(
  location: CalendarLocationInput | null | undefined,
): string | undefined {
  if (location === null || location === undefined) return undefined;

  const address = composePostalAddress(location);
  return joinNameAndAddress(location.name, address, location.city);
}

function composePostalAddress(location: CalendarLocationInput): string | undefined {
  const street = joinParts([usableLine(location.address1), usableLine(location.address2)], ', ');
  const locality = joinParts([location.zip, location.city], ' ');

  if (street !== undefined) {
    if (locality === undefined || statesLocality(street, location.zip, location.city)) {
      return street;
    }
    return joinParts([street, locality], ', ');
  }

  if (locality !== undefined) return locality;

  const shortAddress = clean(location.shortAddress);
  if (shortAddress !== undefined) return shortAddress;

  return flattenUnique(location.address ?? location.fullAddress);
}

function joinNameAndAddress(
  rawName: string | null | undefined,
  address: string | undefined,
  city: string | null | undefined,
): string | undefined {
  const name = clean(rawName);
  if (name === undefined) return address;
  if (address === undefined) return name;

  const comparableName = forComparison(name);
  const comparableAddress = forComparison(address);
  if (comparableAddress.includes(comparableName)) return address;
  if (city !== null && city !== undefined && comparableName === forComparison(city)) return address;

  return `${name}, ${address}`;
}

/** True when the street line already states the postal code and the city. */
function statesLocality(
  street: string,
  zip: string | null | undefined,
  city: string | null | undefined,
): boolean {
  const haystack = forComparison(street);
  const postalCode = clean(zip);
  const cityName = clean(city);

  if (postalCode !== undefined && cityName !== undefined) {
    const locality = forComparison(`${postalCode} ${cityName}`);
    if (haystack.endsWith(locality)) return true;
    return haystack.includes(postalCode) && haystack.includes(forComparison(cityName));
  }
  if (postalCode !== undefined) return haystack.includes(postalCode);
  if (cityName !== undefined) return haystack.includes(forComparison(cityName));
  return false;
}

function usableLine(value: string | null | undefined): string | undefined {
  const line = clean(value);
  // A source that stores a map link instead of a street line gives the calendar
  // client nothing it can display, so the place name is preferred over it.
  if (line === undefined || /^https?:\/\//i.test(line)) return undefined;
  return line;
}

function clean(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? undefined : trimmed;
}

function forComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

/** Flattens a multiline address, dropping lines the previous text already covers. */
function flattenUnique(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;

  const kept: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const cleaned = clean(line);
    if (cleaned === undefined) continue;
    const accumulated = kept.join(', ');
    if (accumulated !== '' && forComparison(accumulated).includes(forComparison(cleaned))) continue;
    kept.push(cleaned);
  }
  return kept.length === 0 ? undefined : kept.join(', ');
}

function joinParts(
  parts: ReadonlyArray<string | null | undefined>,
  separator: string,
): string | undefined {
  const cleaned = parts.map(clean).filter((part): part is string => part !== undefined);
  return cleaned.length === 0 ? undefined : cleaned.join(separator);
}
