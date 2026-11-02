import { normalizeDepartmentCode, normalizeGeographicName } from '../domain/geographic-identity.js';
import type { GeographicReferenceReader } from './geographic-reference-reader.js';
import { departmentFromPostalCode } from './postal-department.js';
import type { CommuneReferenceRecord, Diagnostic, RawLocationFields } from './reference-types.js';

export interface CommuneResolution {
  commune?: CommuneReferenceRecord;
  diagnostics: Diagnostic[];
}

/**
 * The commune is resolved from a stated name only: `location.commune.name` first, then
 * `location.city`, which carries the same information. The postal code never selects a
 * commune; it only disambiguates homonyms through its department prefix, so an
 * arrondissement-level code such as 75005 still attaches the event to Paris.
 */
export async function resolveCommune(
  input: RawLocationFields,
  reader: GeographicReferenceReader,
  version: string,
): Promise<CommuneResolution> {
  const statedName = input.communeName?.trim();
  const name = statedName === undefined || statedName === '' ? input.city?.trim() : statedName;
  const field =
    statedName === undefined || statedName === '' ? 'location.city' : 'location.commune.name';

  if (name === undefined || name === '') {
    return {
      diagnostics: [
        warning(
          'commune_name_missing',
          'location.commune.name',
          'no commune name and no city name were stated',
        ),
      ],
    };
  }

  const candidates = await reader.findCommunesByNormalizedName(
    version,
    normalizeGeographicName(name),
  );

  if (candidates.length === 0) {
    const arrondissement = await resolveArrondissementByPostalCode(input.zip, reader, version);
    if (arrondissement !== undefined) return { commune: arrondissement, diagnostics: [] };
    return {
      diagnostics: [warning('commune_unknown', field, `no commune matches "${name}"`)],
    };
  }
  if (candidates.length === 1 && candidates[0] !== undefined) {
    return { commune: candidates[0], diagnostics: [] };
  }

  const departmentCode = departmentHint(input);
  if (departmentCode !== undefined) {
    const selected = candidates.filter((candidate) => candidate.departmentCode === departmentCode);
    if (selected.length === 1 && selected[0] !== undefined) {
      return { commune: selected[0], diagnostics: [] };
    }
  }

  return {
    diagnostics: [
      warning(
        'commune_match_ambiguous',
        field,
        `"${name}" matches ${candidates.length} communes and no department selects one`,
      ),
    ],
  };
}

async function resolveArrondissementByPostalCode(
  postalCode: string | undefined,
  reader: GeographicReferenceReader,
  version: string,
): Promise<CommuneReferenceRecord | undefined> {
  if (postalCode === undefined || !/^(?:13|69|75)\d{3}$/.test(postalCode)) return undefined;
  const candidates = await reader.findCommunesByPostalCode(version, postalCode);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function departmentHint(input: RawLocationFields): string | undefined {
  const stated =
    input.departement === undefined ? undefined : normalizeDepartmentCode(input.departement);
  return stated ?? departmentFromPostalCode(input.zip);
}

function warning(code: string, field: string, message: string): Diagnostic {
  return { code, field, message, severity: 'warning' };
}
