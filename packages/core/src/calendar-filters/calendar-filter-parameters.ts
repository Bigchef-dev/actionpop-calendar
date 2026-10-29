export interface CalendarFilterDiagnostic {
  readonly code: string;
  readonly field: string;
  readonly message: string;
  readonly severity: 'error';
}

export const SUPPORTED_PARAMETERS = new Set([
  'country',
  'department',
  'commune_name',
  'insee_commune',
  'event_type',
]);

export const UNSUPPORTED_PARAMETERS = new Set([
  'region',
  'epci',
  'constituency',
  'lat',
  'lon',
  'coordinates',
]);

/** Rejects every parameter the calendar contract does not define. */
export function collectParameterDiagnostics(
  query: Record<string, string | undefined>,
): CalendarFilterDiagnostic[] {
  const diagnostics: CalendarFilterDiagnostic[] = [];

  for (const name of Object.keys(query)) {
    if (query[name] === undefined) continue;
    if (SUPPORTED_PARAMETERS.has(name)) continue;
    diagnostics.push(
      UNSUPPORTED_PARAMETERS.has(name)
        ? {
            code: 'filter_parameter_unsupported',
            field: name,
            message: `"${name}" is not supported by the calendar filter contract`,
            severity: 'error',
          }
        : {
            code: 'filter_parameter_unknown',
            field: name,
            message: `"${name}" is not a recognized calendar filter parameter`,
            severity: 'error',
          },
    );
  }

  return diagnostics;
}

export interface SingleValue {
  readonly value?: string;
  readonly diagnostic?: CalendarFilterDiagnostic;
}

export interface ParsedList {
  readonly values?: readonly string[];
  readonly diagnostic?: CalendarFilterDiagnostic;
}

export function readSingle(raw: string | undefined, field: string): SingleValue {
  if (raw === undefined) return {};
  const value = raw.trim();
  if (value === '') return { diagnostic: emptyValueDiagnostic(field) };
  return { value };
}

export function readList(raw: string | undefined, field: string): ParsedList {
  if (raw === undefined) return {};
  const items = raw.split(',').map((item) => item.trim());
  if (items.some((item) => item === '')) {
    return {
      diagnostic: {
        code: 'filter_value_invalid',
        field,
        message: `${field} must not contain an empty item`,
        severity: 'error',
      },
    };
  }
  return { values: [...new Set(items)] };
}

function emptyValueDiagnostic(field: string): CalendarFilterDiagnostic {
  return {
    code: 'filter_value_invalid',
    field,
    message: `${field} must not be empty`,
    severity: 'error',
  };
}
