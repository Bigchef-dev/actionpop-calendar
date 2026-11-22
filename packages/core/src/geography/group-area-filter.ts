import { normalizeCountryCode, normalizeDepartmentCode } from '../domain/geographic-identity.js';
import { GROUP_LISTING_LIMIT } from '../models/group-listing.js';
import {
  readList,
  readSingle,
  type CalendarFilterDiagnostic,
} from '../calendar-filters/calendar-filter-parameters.js';
import { parsePaging, parameterDiagnostics } from './group-area-parameters.js';

/**
 * Parses the geographic area of a group listing with the project's existing vocabulary.
 *
 * The read is a catalogue read, so `event_type` and `group` are absent on purpose: accepting them
 * and ignoring them would promise a filter the answer cannot apply. `commune` is accepted as an
 * alias of `insee_commune` because both name the same criterion and a consumer should not have to
 * guess which spelling a route uses.
 */
export type GroupAreaParseResult =
  | {
      readonly ok: true;
      readonly criteria: ParsedGroupArea;
    }
  | { readonly ok: false; readonly diagnostics: readonly CalendarFilterDiagnostic[] };

export interface ParsedGroupArea {
  readonly country?: string;
  readonly department?: string;
  readonly communeIds?: readonly string[];
  readonly communeNames?: readonly string[];
  readonly epciIds?: readonly string[];
  readonly limit: number;
  readonly offset: number;
}

export function parseGroupArea(query: Record<string, string | undefined>): GroupAreaParseResult {
  const diagnostics = parameterDiagnostics(query);

  const country = readSingle(query['country'], 'country');
  if (country.diagnostic !== undefined) diagnostics.push(country.diagnostic);
  const department = readSingle(query['department'], 'department');
  if (department.diagnostic !== undefined) diagnostics.push(department.diagnostic);
  const insee = readList(query['insee_commune'], 'insee_commune');
  if (insee.diagnostic !== undefined) diagnostics.push(insee.diagnostic);
  const commune = readList(query['commune'], 'commune');
  if (commune.diagnostic !== undefined) diagnostics.push(commune.diagnostic);
  const communeNames = readList(query['commune_name'], 'commune_name');
  if (communeNames.diagnostic !== undefined) diagnostics.push(communeNames.diagnostic);
  const epci = readList(query['epci'], 'epci');
  if (epci.diagnostic !== undefined) diagnostics.push(epci.diagnostic);
  const limit = parsePaging(query['limit'], 'limit');
  if (limit.diagnostic !== undefined) diagnostics.push(limit.diagnostic);
  const offset = parsePaging(query['offset'], 'offset');
  if (offset.diagnostic !== undefined) diagnostics.push(offset.diagnostic);

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const normalizedCountry =
    country.value === undefined ? undefined : normalizeCountryCode(country.value);
  if (country.value !== undefined && normalizedCountry === undefined) {
    return { ok: false, diagnostics: [invalidCountry(country.value)] };
  }
  const normalizedDepartment =
    department.value === undefined ? undefined : normalizeDepartmentCode(department.value);
  if (department.value !== undefined && normalizedDepartment === undefined) {
    return { ok: false, diagnostics: [invalidDepartment()] };
  }

  const communeIds = [...new Set([...(insee.values ?? []), ...(commune.values ?? [])])].sort();
  const criteria: ParsedGroupArea = {
    ...(normalizedCountry === undefined ? {} : { country: normalizedCountry }),
    ...(normalizedDepartment === undefined ? {} : { department: normalizedDepartment }),
    ...(communeIds.length === 0 ? {} : { communeIds }),
    ...(communeNames.values === undefined ? {} : { communeNames: communeNames.values }),
    ...(epci.values === undefined ? {} : { epciIds: epci.values }),
    limit: limit.value ?? GROUP_LISTING_LIMIT.default,
    offset: offset.value ?? 0,
  };
  return { ok: true, criteria };
}

/**
 * True when the request names an area at all. A commune name or an EPCI identifier counts: both
 * become a commune dimension before the read, so rejecting them here would refuse a valid area.
 */
export function namesAnArea(criteria: {
  readonly country?: string;
  readonly department?: string;
  readonly communeIds?: readonly string[];
  readonly communeNames?: readonly string[];
  readonly epciIds?: readonly string[];
}): boolean {
  return (
    criteria.country !== undefined ||
    criteria.department !== undefined ||
    (criteria.communeIds !== undefined && criteria.communeIds.length > 0) ||
    (criteria.communeNames !== undefined && criteria.communeNames.length > 0) ||
    (criteria.epciIds !== undefined && criteria.epciIds.length > 0)
  );
}

function invalidCountry(value: string): CalendarFilterDiagnostic {
  return {
    code: 'filter_value_invalid',
    field: 'country',
    message: `"${value}" is not a two-letter country code`,
    severity: 'error',
  };
}

function invalidDepartment(): CalendarFilterDiagnostic {
  return {
    code: 'filter_value_invalid',
    field: 'department',
    message: 'department must be a non-empty code',
    severity: 'error',
  };
}
