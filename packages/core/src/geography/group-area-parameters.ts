import type { CalendarFilterDiagnostic } from '../calendar-filters/calendar-filter-parameters.js';
import { GROUP_LISTING_LIMIT } from '../models/group-listing.js';

/**
 * Parameter surface of the group listing. `event_type` and `group` are rejected rather than
 * ignored: the read is a catalogue read, so promising a filter it cannot apply would be a lie.
 */
export const GROUP_AREA_PARAMETERS = [
  'country',
  'department',
  'insee_commune',
  'commune',
  'commune_name',
  'epci',
  'limit',
  'offset',
] as const;

const SUPPORTED = new Set<string>(GROUP_AREA_PARAMETERS);
const UNSUPPORTED = new Set([
  'region',
  'constituency',
  'lat',
  'lon',
  'coordinates',
  'event_type',
  'group',
]);

export interface ParsedPaging {
  readonly value?: number;
  readonly diagnostic?: CalendarFilterDiagnostic;
}

export function parsePaging(raw: string | undefined, field: 'limit' | 'offset'): ParsedPaging {
  const bounds: { readonly min: number; readonly max: number } =
    field === 'limit'
      ? { min: GROUP_LISTING_LIMIT.min, max: GROUP_LISTING_LIMIT.max }
      : { min: 0, max: Number.MAX_SAFE_INTEGER };
  const code = field === 'limit' ? 'limit_invalid' : 'offset_invalid';

  if (raw === undefined) return {};
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    return {
      diagnostic: {
        code,
        field,
        message: `${field} must be a non-negative integer`,
        severity: 'error',
      },
    };
  }
  const parsed = Number(value);
  if (parsed < bounds.min || parsed > bounds.max) {
    return {
      diagnostic: {
        code,
        field,
        message: `${field} must be between ${bounds.min} and ${bounds.max}`,
        severity: 'error',
      },
    };
  }
  return { value: parsed };
}

export function parameterDiagnostics(
  query: Record<string, string | undefined>,
): CalendarFilterDiagnostic[] {
  const diagnostics: CalendarFilterDiagnostic[] = [];
  for (const name of Object.keys(query)) {
    if (query[name] === undefined || SUPPORTED.has(name)) continue;
    diagnostics.push({
      code: UNSUPPORTED.has(name) ? 'filter_parameter_unsupported' : 'filter_parameter_unknown',
      field: name,
      message: UNSUPPORTED.has(name)
        ? `"${name}" is not supported by the group area contract`
        : `"${name}" is not a recognized group area parameter`,
      severity: 'error',
    });
  }
  return diagnostics;
}
