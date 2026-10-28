import { normalizeGeographicName } from '../../src/domain/geographic-identity.js';
import type { GeographicReferenceReader } from '../../src/geography/geographic-reference-reader.js';
import type {
  CommuneReferenceRecord,
  DepartmentReferenceRecord,
  GeographicReferenceVersionRecord,
} from '../../src/geography/reference-types.js';

export const VERSION = 'communes-test-v1';

export function makeDepartment(
  code: string,
  name = `Département ${code}`,
): DepartmentReferenceRecord {
  return { code, name, communeCount: 1 };
}

export function makeCommune(
  inseeCode: string,
  name: string,
  departmentCode: string,
  postalCodes: string[] = [],
  alias = name,
): CommuneReferenceRecord {
  return {
    inseeCode,
    name,
    normalizedName: normalizeGeographicName(name),
    pronounFreeNormalizedName: normalizeGeographicName(alias),
    postalCodes,
    departmentCode,
  };
}

export class FakeReferenceReader implements GeographicReferenceReader {
  public constructor(
    private readonly version: GeographicReferenceVersionRecord | null,
    private readonly communes: CommuneReferenceRecord[],
    private readonly departments: DepartmentReferenceRecord[],
  ) {}

  public async findActiveVersion(): Promise<GeographicReferenceVersionRecord | null> {
    return this.version;
  }

  public async findDepartment(
    version: string,
    code: string,
  ): Promise<DepartmentReferenceRecord | null> {
    if (this.version?.version !== version) return null;
    return this.departments.find(department => department.code === code) ?? null;
  }

  public async findCommunesByNormalizedName(
    version: string,
    key: string,
  ): Promise<CommuneReferenceRecord[]> {
    if (this.version?.version !== version) return [];
    return this.communes.filter(
      commune =>
        commune.normalizedName === key || commune.pronounFreeNormalizedName === key,
    );
  }

  public async findCommunesByPostalCode(
    version: string,
    postalCode: string,
  ): Promise<CommuneReferenceRecord[]> {
    if (this.version?.version !== version) return [];
    return this.communes.filter(commune => commune.postalCodes.includes(postalCode));
  }
}

export function activeVersion(): GeographicReferenceVersionRecord {
  return {
    version: VERSION,
    status: 'active',
    source: 'data/communes-france-2026.csv',
    publicationDate: '2026-01-01',
    ingestedAt: '2026-10-28T00:00:00.000Z',
    license: 'Licence Ouverte 2.0',
    communeCount: 3,
    departmentCount: 2,
    checksum: 'checksum-test',
  };
}
