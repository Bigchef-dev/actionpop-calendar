import { normalizeCountryCode, normalizeDepartmentCode } from '../domain/geographic-identity.js';
import {
  collectParameterDiagnostics,
  readList,
  readSingle,
  type CalendarFilterDiagnostic,
} from './calendar-filter-parameters.js';

export type { CalendarFilterDiagnostic } from './calendar-filter-parameters.js';

export interface CalendarFilterCriteria {
  readonly country?: string;
  readonly department?: string;
  readonly communeNames?: readonly string[];
  readonly communeIds?: readonly string[];
  readonly eventTypes?: readonly string[];
  readonly groupIds?: readonly string[];
  readonly epciIds?: readonly string[];
}

export type CalendarFilterResult =
  | { readonly ok: true; readonly criteria: CalendarFilterCriteria }
  | { readonly ok: false; readonly diagnostics: readonly CalendarFilterDiagnostic[] };

export function parseCalendarFilter(
  query: Record<string, string | undefined>,
): CalendarFilterResult {
  const diagnostics = collectParameterDiagnostics(query);

  const country = readSingle(query.country, 'country');
  if (country.diagnostic !== undefined) diagnostics.push(country.diagnostic);
  const department = readSingle(query.department, 'department');
  if (department.diagnostic !== undefined) diagnostics.push(department.diagnostic);
  const communeNames = readList(query.commune_name, 'commune_name');
  if (communeNames.diagnostic !== undefined) diagnostics.push(communeNames.diagnostic);
  const inseeCommunes = readList(query.insee_commune, 'insee_commune');
  if (inseeCommunes.diagnostic !== undefined) diagnostics.push(inseeCommunes.diagnostic);
  const eventTypes = readList(query.event_type, 'event_type');
  if (eventTypes.diagnostic !== undefined) diagnostics.push(eventTypes.diagnostic);
  const groupIds = readList(query.group, 'group');
  if (groupIds.diagnostic !== undefined) diagnostics.push(groupIds.diagnostic);
  const epciIds = readList(query.epci, 'epci');
  if (epciIds.diagnostic !== undefined) diagnostics.push(epciIds.diagnostic);

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const criteria: MutableCriteria = {};
  if (country.value !== undefined) {
    const code = normalizeCountryCode(country.value);
    if (code === undefined) {
      return { ok: false, diagnostics: [invalidCountry(country.value)] };
    }
    criteria.country = code;
  }
  if (department.value !== undefined) {
    const code = normalizeDepartmentCode(department.value);
    if (code === undefined) {
      return { ok: false, diagnostics: [invalidDepartment()] };
    }
    criteria.department = code;
  }
  if (communeNames.values !== undefined) criteria.communeNames = communeNames.values;
  if (inseeCommunes.values !== undefined) criteria.communeIds = inseeCommunes.values;
  if (eventTypes.values !== undefined) criteria.eventTypes = eventTypes.values;
  if (groupIds.values !== undefined) criteria.groupIds = groupIds.values;
  if (epciIds.values !== undefined) criteria.epciIds = epciIds.values;

  return { ok: true, criteria };
}

interface MutableCriteria {
  country?: string;
  department?: string;
  communeNames?: readonly string[];
  communeIds?: readonly string[];
  eventTypes?: readonly string[];
  groupIds?: readonly string[];
  epciIds?: readonly string[];
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
