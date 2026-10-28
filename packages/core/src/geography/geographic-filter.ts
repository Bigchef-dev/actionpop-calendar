import { normalizeCountryCode, normalizeDepartmentCode } from '../domain/geographic-identity.js';

export interface GeographicFilter {
  country?: string;
  department?: string;
  commune?: string;
  eventType?: string;
}

export type GeographicFilterResult =
  | { ok: true; filter: GeographicFilter }
  | {
      ok: false;
      diagnostics: Array<{ code: string; field: string; message: string; severity: 'error' }>;
    };

const SUPPORTED_PARAMETERS = new Set(['country', 'department', 'commune', 'event_type']);
const UNSUPPORTED_PARAMETERS = new Set([
  'region',
  'epci',
  'constituency',
  'lat',
  'lon',
  'coordinates',
]);

export function parseGeographicFilter(
  query: Record<string, string | undefined>,
): GeographicFilterResult {
  const diagnostics: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'error';
  }> = [];

  for (const name of Object.keys(query)) {
    if (query[name] === undefined) continue;
    if (SUPPORTED_PARAMETERS.has(name)) continue;
    if (UNSUPPORTED_PARAMETERS.has(name)) {
      diagnostics.push({
        code: 'filter_parameter_unsupported',
        field: name,
        message: `"${name}" is not supported by the geographic filter contract`,
        severity: 'error',
      });
      continue;
    }
    diagnostics.push({
      code: 'filter_parameter_unknown',
      field: name,
      message: `"${name}" is not a recognized filter parameter`,
      severity: 'error',
    });
  }

  const country = readValue(query.country, 'country');
  if (country.error !== undefined) diagnostics.push(country.error);
  const department = readValue(query.department, 'department');
  if (department.error !== undefined) diagnostics.push(department.error);
  const commune = readValue(query.commune, 'commune');
  if (commune.error !== undefined) diagnostics.push(commune.error);
  const eventType = readValue(query.event_type, 'event_type');
  if (eventType.error !== undefined) diagnostics.push(eventType.error);

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const filter: GeographicFilter = {};
  if (country.value !== undefined) {
    const code = normalizeCountryCode(country.value);
    if (code === undefined) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'filter_value_invalid',
            field: 'country',
            message: `"${country.value}" is not a two-letter country code`,
            severity: 'error',
          },
        ],
      };
    }
    filter.country = code;
  }
  if (department.value !== undefined) {
    const code = normalizeDepartmentCode(department.value);
    if (code === undefined) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'filter_value_invalid',
            field: 'department',
            message: 'department must be a non-empty code',
            severity: 'error',
          },
        ],
      };
    }
    filter.department = code;
  }
  if (commune.value !== undefined) filter.commune = commune.value;
  if (eventType.value !== undefined) filter.eventType = eventType.value;

  return { ok: true, filter };
}

type ReadValue =
  | { value?: string; error?: undefined }
  | {
      value?: undefined;
      error: { code: string; field: string; message: string; severity: 'error' };
    };

function readValue(raw: string | undefined, field: string): ReadValue {
  if (raw === undefined) return {};
  const value = raw.trim();
  if (value === '') {
    return {
      error: {
        code: 'filter_value_invalid',
        field,
        message: `${field} must not be empty`,
        severity: 'error',
      },
    };
  }
  return { value };
}
