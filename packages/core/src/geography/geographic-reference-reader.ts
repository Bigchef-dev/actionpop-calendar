import type {
  CommuneReferenceRecord,
  DepartmentReferenceRecord,
  GeographicReferenceVersionRecord,
} from './reference-types.js';
import type { CommuneNameResolution } from '../calendar-filters/calendar-criteria.js';

export interface GeographicReferenceReader {
  findActiveVersion(): Promise<GeographicReferenceVersionRecord | null>;
  findDepartment(version: string, code: string): Promise<DepartmentReferenceRecord | null>;
  findCommunesByNormalizedName(version: string, key: string): Promise<CommuneReferenceRecord[]>;
  findCommunesByPostalCode(version: string, postalCode: string): Promise<CommuneReferenceRecord[]>;
  resolveEpcis?(ids: readonly string[]): Promise<CommuneNameResolution>;
}
