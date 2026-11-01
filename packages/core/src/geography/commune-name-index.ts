import { createHash } from 'node:crypto';

import { normalizeGeographicName } from '../domain/geographic-identity.js';
import type { CommuneCsvRow } from './commune-csv-parser.js';
import type { CommuneReferenceRecord, DepartmentReferenceRecord } from './reference-types.js';

export interface IndexedReference {
  communes: CommuneReferenceRecord[];
  departments: DepartmentReferenceRecord[];
  checksum: string;
}

export function buildReferenceIndex(rows: CommuneCsvRow[]): IndexedReference {
  const departments = new Map<string, DepartmentReferenceRecord>();
  const communes: CommuneReferenceRecord[] = [];

  for (const row of rows) {
    const department = departments.get(row.departmentCode);
    if (department === undefined) {
      departments.set(row.departmentCode, {
        code: row.departmentCode,
        name: row.departmentName,
        communeCount: 1,
      });
    } else {
      department.communeCount += 1;
    }

    communes.push({
      inseeCode: row.inseeCode,
      name: row.name,
      normalizedName: normalizeGeographicName(row.name),
      pronounFreeNormalizedName: normalizeGeographicName(
        row.pronounFreeName === '' ? row.name : row.pronounFreeName,
      ),
      postalCodes: row.postalCodes,
      departmentCode: row.departmentCode,
      ...(row.population === undefined ? {} : { population: row.population }),
    });
  }

  return {
    communes,
    departments: [...departments.values()].sort((left, right) =>
      left.code.localeCompare(right.code),
    ),
    checksum: computeChecksum(rows),
  };
}

export function computeChecksum(rows: CommuneCsvRow[]): string {
  const hash = createHash('sha256');
  for (const row of rows) {
    hash.update(
      [
        row.inseeCode,
        row.name,
        row.pronounFreeName,
        row.postalCodes.join('|'),
        row.departmentCode,
        row.departmentName,
        row.population === undefined ? '' : String(row.population),
      ].join('\u0000'),
    );
    hash.update('\u0001');
  }
  return hash.digest('hex');
}
