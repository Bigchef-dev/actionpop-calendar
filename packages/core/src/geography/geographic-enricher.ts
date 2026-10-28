import { classifyCountry } from './country-classifier.js';
import { resolveCommune } from './commune-resolver.js';
import { validateDepartment } from './department-validator.js';
import type { GeographicReferenceReader } from './geographic-reference-reader.js';
import type {
  Diagnostic,
  GeographicAttachment,
  GeographicStatus,
  RawLocationFields,
} from './reference-types.js';

export async function enrichEventGeography(
  raw: RawLocationFields,
  reader: GeographicReferenceReader,
): Promise<GeographicAttachment> {
  const country = classifyCountry(raw.country);
  const version = await reader.findActiveVersion();

  if (version === null) {
    // The stated country needs no reference data, so it survives an unavailable reference.
    return {
      geographicStatus: 'unavailable',
      diagnostics: [
        ...country.diagnostics,
        {
          code: 'reference_unavailable',
          field: 'geography.reference',
          message: 'no active geographic reference version is available',
          severity: 'error',
        },
      ],
      ...(country.countryCode === undefined ? {} : { countryCode: country.countryCode }),
      ...(raw.departement === undefined ? {} : { rawDepartmentCode: raw.departement }),
      ...(raw.communeName === undefined ? {} : { rawCommuneName: raw.communeName }),
    };
  }

  const base = rawFields(raw, version.version);

  if (country.scope === 'foreign') {
    return {
      ...base,
      geographicStatus: 'international',
      diagnostics: country.diagnostics,
      ...(country.countryCode === undefined ? {} : { countryCode: country.countryCode }),
    };
  }

  if (country.scope === 'unsupported') {
    return {
      ...base,
      geographicStatus: 'national',
      diagnostics: country.diagnostics,
    };
  }

  const communeResolution = await resolveCommune(raw, reader, version.version);
  const departmentResolution = await validateDepartment(
    raw,
    communeResolution.commune,
    reader,
    version.version,
  );
  const diagnostics: Diagnostic[] = [
    ...country.diagnostics,
    ...communeResolution.diagnostics,
    ...departmentResolution.diagnostics,
  ];

  return {
    ...base,
    geographicStatus: resolveStatus({
      hasCommune: communeResolution.commune !== undefined,
      hasDepartment: departmentResolution.departmentCode !== undefined,
      countryCode: country.countryCode,
    }),
    diagnostics,
    ...(country.countryCode === undefined ? {} : { countryCode: country.countryCode }),
    ...(communeResolution.commune === undefined
      ? {}
      : { communeId: communeResolution.commune.inseeCode }),
    ...(departmentResolution.departmentCode === undefined
      ? {}
      : { departmentCode: departmentResolution.departmentCode }),
    ...(departmentResolution.departmentSource === undefined
      ? {}
      : { departmentSource: departmentResolution.departmentSource }),
  };
}

function resolveStatus(input: {
  hasCommune: boolean;
  hasDepartment: boolean;
  countryCode: string | undefined;
}): GeographicStatus {
  if (input.hasCommune && input.hasDepartment) return 'resolved';
  if (input.hasDepartment || input.countryCode !== undefined) return 'incomplete';
  return 'national';
}

function rawFields(
  raw: RawLocationFields,
  version: string,
): Pick<GeographicAttachment, 'referenceVersion' | 'rawDepartmentCode' | 'rawCommuneName'> {
  return {
    referenceVersion: version,
    ...(raw.departement === undefined ? {} : { rawDepartmentCode: raw.departement }),
    ...(raw.communeName === undefined ? {} : { rawCommuneName: raw.communeName }),
  };
}
