import { normalizeDepartmentCode } from '../domain/geographic-identity.js';
import type { GeographicReferenceReader } from './geographic-reference-reader.js';
import type {
  CommuneReferenceRecord,
  DepartmentSource,
  Diagnostic,
  RawLocationFields,
} from './reference-types.js';

export interface DepartmentResolution {
  departmentCode?: string;
  departmentSource?: DepartmentSource;
  diagnostics: Diagnostic[];
}

export async function validateDepartment(
  input: RawLocationFields,
  commune: CommuneReferenceRecord | undefined,
  reader: GeographicReferenceReader,
  version: string,
): Promise<DepartmentResolution> {
  const rawCode = input.departement;
  const departmentCode = rawCode === undefined ? undefined : normalizeDepartmentCode(rawCode);

  if (departmentCode !== undefined) {
    const stated = await reader.findDepartment(version, departmentCode);
    if (stated !== null) {
      const diagnostics: Diagnostic[] = [];
      if (commune !== undefined && commune.departmentCode !== departmentCode) {
        diagnostics.push({
          code: 'department_commune_mismatch',
          field: 'location.departement',
          message: `stated department "${departmentCode}" differs from the commune department "${commune.departmentCode}"`,
          severity: 'warning',
        });
      }
      return { departmentCode, departmentSource: 'stated', diagnostics };
    }
  }

  if (commune !== undefined) {
    const fromCommune = await reader.findDepartment(version, commune.departmentCode);
    const diagnostics: Diagnostic[] = [];
    if (departmentCode !== undefined || fromCommune === null) {
      diagnostics.push({
        code: 'department_code_unknown',
        field: 'location.departement',
        message:
          departmentCode === undefined
            ? `commune "${commune.name}" references an unknown department "${commune.departmentCode}"`
            : `department code "${departmentCode}" is not in the active reference`,
        severity: 'warning',
      });
    }
    if (fromCommune === null) return { diagnostics };
    return { departmentCode: commune.departmentCode, departmentSource: 'reference', diagnostics };
  }

  if (departmentCode !== undefined) {
    return {
      diagnostics: [
        {
          code: 'department_code_unknown',
          field: 'location.departement',
          message: `department code "${departmentCode}" is not in the active reference`,
          severity: 'warning',
        },
      ],
    };
  }

  return { diagnostics: [] };
}
