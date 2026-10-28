import type {
  CommuneReferenceRecord,
  DepartmentReferenceRecord,
  GeographicReferenceVersionRecord,
} from './reference-types.js';

export interface GeographicReferenceReader {
  findActiveVersion(): Promise<GeographicReferenceVersionRecord | null>;
  findDepartment(version: string, code: string): Promise<DepartmentReferenceRecord | null>;
  findCommunesByNormalizedName(version: string, key: string): Promise<CommuneReferenceRecord[]>;
  findCommunesByPostalCode(version: string, postalCode: string): Promise<CommuneReferenceRecord[]>;
}
