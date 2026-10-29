import { normalizeGeographicName } from '../domain/geographic-identity.js';
import type { CalendarFilterDiagnostic } from '../calendar-filters/calendar-filter.js';
import type { GeographicReferenceReader } from './geographic-reference-reader.js';
import type { CommuneReferenceRecord } from './reference-types.js';

export interface ResolvedCommuneNames {
  readonly inseeCodes: readonly string[];
  readonly diagnostics: readonly CalendarFilterDiagnostic[];
}

/**
 * Turns the commune names supplied on a calendar request into INSEE codes.
 *
 * Matching is exact after normalization of case, accents, punctuation and
 * whitespace against the active reference, never fuzzy. A name that matches
 * several communes is disambiguated by the stated department; when it remains
 * ambiguous the request is rejected instead of selecting a commune arbitrarily.
 */
export class CommuneNameResolver {
  public constructor(private readonly reader: GeographicReferenceReader) {}

  public async resolve(
    names: readonly string[],
    department: string | undefined,
  ): Promise<ResolvedCommuneNames> {
    const version = await this.reader.findActiveVersion();
    if (version === null) {
      return {
        inseeCodes: [],
        diagnostics: [
          error(
            'commune_name_unavailable',
            'commune_name',
            'no geographic reference version is active, so commune names cannot be resolved',
          ),
        ],
      };
    }

    const codes = new Set<string>();
    const diagnostics: CalendarFilterDiagnostic[] = [];

    for (const name of names) {
      const candidates = await this.reader.findCommunesByNormalizedName(
        version.version,
        normalizeGeographicName(name),
      );

      if (candidates.length === 0) continue;

      if (candidates.length === 1 && candidates[0] !== undefined) {
        codes.add(candidates[0].inseeCode);
        continue;
      }

      const selected = selectByDepartment(candidates, department);
      if (selected !== undefined) {
        codes.add(selected.inseeCode);
        continue;
      }

      diagnostics.push(ambiguityDiagnostic(name, candidates));
    }

    return { inseeCodes: [...codes].sort(), diagnostics };
  }
}

function selectByDepartment(
  candidates: readonly CommuneReferenceRecord[],
  department: string | undefined,
): CommuneReferenceRecord | undefined {
  if (department === undefined) return undefined;
  const scoped = candidates.filter((candidate) => candidate.departmentCode === department);
  return scoped.length === 1 ? scoped[0] : undefined;
}

function ambiguityDiagnostic(
  name: string,
  candidates: readonly CommuneReferenceRecord[],
): CalendarFilterDiagnostic {
  const codes = candidates
    .map((candidate) => candidate.inseeCode)
    .sort()
    .join(', ');
  return error(
    'commune_name_ambiguous',
    'commune_name',
    `"${name}" matches ${codes}; narrow the request with department or insee_commune`,
  );
}

function error(code: string, field: string, message: string): CalendarFilterDiagnostic {
  return { code, field, message, severity: 'error' };
}
