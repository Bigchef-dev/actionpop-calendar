import type { PrismaClient } from '@prisma/client';

import type { GeographicReferenceReader } from '../geography/geographic-reference-reader.js';
import type {
  CommuneReferenceRecord,
  DepartmentReferenceRecord,
  GeographicReferenceVersionRecord,
} from '../geography/reference-types.js';

export class PostgresGeographicReferenceRepository implements GeographicReferenceReader {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findActiveVersion(): Promise<GeographicReferenceVersionRecord | null> {
    const row = await this.prisma.geographicReferenceVersion.findFirst({
      where: { status: 'active' },
    });
    return row === null ? null : toVersionRecord(row);
  }

  public async findDepartment(
    version: string,
    code: string,
  ): Promise<DepartmentReferenceRecord | null> {
    const row = await this.prisma.departmentReference.findUnique({
      where: { versionId_code: { versionId: version, code } },
    });
    return row === null ? null : { code: row.code, name: row.name, communeCount: row.communeCount };
  }

  public async findCommunesByNormalizedName(
    version: string,
    key: string,
  ): Promise<CommuneReferenceRecord[]> {
    const rows = await this.prisma.communeReference.findMany({
      where: {
        versionId: version,
        OR: [{ normalizedName: key }, { pronounFreeNormalizedName: key }],
      },
      orderBy: { inseeCode: 'asc' },
    });
    return rows.map(toCommuneRecord);
  }

  public async findCommunesByPostalCode(
    version: string,
    postalCode: string,
  ): Promise<CommuneReferenceRecord[]> {
    const rows = await this.prisma.communeReference.findMany({
      where: { versionId: version, postalCodes: { has: postalCode } },
      orderBy: { inseeCode: 'asc' },
    });
    return rows.map(toCommuneRecord);
  }
}

function toVersionRecord(row: {
  version: string;
  status: string;
  source: string;
  publicationDate: string;
  ingestedAt: Date;
  license: string;
  communeCount: number;
  departmentCount: number;
  checksum: string;
}): GeographicReferenceVersionRecord {
  return {
    version: row.version,
    status: row.status,
    source: row.source,
    publicationDate: row.publicationDate,
    ingestedAt: row.ingestedAt.toISOString(),
    license: row.license,
    communeCount: row.communeCount,
    departmentCount: row.departmentCount,
    checksum: row.checksum,
  };
}

function toCommuneRecord(row: {
  inseeCode: string;
  name: string;
  normalizedName: string;
  pronounFreeNormalizedName: string;
  postalCodes: string[];
  departmentCode: string;
}): CommuneReferenceRecord {
  return {
    inseeCode: row.inseeCode,
    name: row.name,
    normalizedName: row.normalizedName,
    pronounFreeNormalizedName: row.pronounFreeNormalizedName,
    postalCodes: row.postalCodes,
    departmentCode: row.departmentCode,
  };
}
