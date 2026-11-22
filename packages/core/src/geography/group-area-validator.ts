import type { CalendarFilterDiagnostic } from '../calendar-filters/calendar-filter-parameters.js';
import type { GeographicReferenceReader } from './geographic-reference-reader.js';

export interface AreaIdentifiers {
  readonly department?: string;
  readonly communeIds?: readonly string[];
}

/**
 * Rejects an identifier the active reference does not know.
 *
 * This is the boundary between "this area holds no group" and "this area does not exist": the
 * first is a valid empty answer, the second would otherwise look identical and hide a consumer's
 * typo or a stale identifier. Only the first unknown value is named, so a confused request gets
 * one actionable diagnostic instead of a wall of them.
 */
export async function validateAreaIdentifiers(
  reader: GeographicReferenceReader,
  version: string,
  identifiers: AreaIdentifiers,
): Promise<readonly CalendarFilterDiagnostic[]> {
  const diagnostics: CalendarFilterDiagnostic[] = [];

  if (identifiers.department !== undefined) {
    const department = await reader.findDepartment(version, identifiers.department);
    if (department === null) {
      diagnostics.push(
        error(
          'department_invalid',
          'department',
          `department "${identifiers.department}" is not in the active geographic reference`,
        ),
      );
    }
  }

  const codes = identifiers.communeIds ?? [];
  if (codes.length > 0) {
    const known = new Set(
      (await reader.findCommunesByCodes?.(version, codes))?.map((commune) => commune.inseeCode) ??
        codes,
    );
    const unknown = codes.find((code) => !known.has(code));
    if (unknown !== undefined) {
      diagnostics.push(
        error(
          'commune_invalid',
          'insee_commune',
          `commune "${unknown}" is not in the active geographic reference`,
        ),
      );
    }
  }

  return diagnostics;
}

function error(code: string, field: string, message: string): CalendarFilterDiagnostic {
  return { code, field, message, severity: 'error' };
}
