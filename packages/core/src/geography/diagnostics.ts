import type { DiagnosticSeverity } from './reference-types.js';

const SEVERITIES: Record<string, DiagnosticSeverity> = {
  country_missing: 'warning',
  country_unsupported: 'warning',
  commune_name_missing: 'warning',
  commune_unknown: 'warning',
  commune_match_ambiguous: 'warning',
  department_code_unknown: 'warning',
  department_commune_mismatch: 'warning',
  event_type_invalid: 'error',
  event_type_missing: 'warning',
  reference_unavailable: 'error',
  reference_source_missing: 'error',
  reference_publication_date_missing: 'error',
  reference_license_missing: 'error',
  reference_csv_invalid: 'error',
  reference_duplicate_identifier: 'error',
  reference_commune_name_missing: 'error',
  reference_department_missing: 'error',
  reference_coverage_insufficient: 'error',
  reference_activation_conflict: 'error',
  reference_activation_failed: 'error',
  filter_parameter_unsupported: 'error',
  filter_parameter_unknown: 'error',
  filter_value_invalid: 'error',
};

export function isKnownDiagnostic(code: string): boolean {
  return Object.hasOwn(SEVERITIES, code);
}

export function severityOf(code: string): DiagnosticSeverity {
  return SEVERITIES[code] ?? 'warning';
}
