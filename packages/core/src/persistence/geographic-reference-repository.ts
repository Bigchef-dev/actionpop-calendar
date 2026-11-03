import type { PrismaClient } from '@prisma/client';

import type { GeographicReferenceReader } from '../geography/geographic-reference-reader.js';
import type { CommuneNameResolution } from '../calendar-filters/calendar-criteria.js';
import { isEpciKind } from '../geography/epci-reference.js';
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
      select: {
        inseeCode: true,
        name: true,
        normalizedName: true,
        pronounFreeNormalizedName: true,
        postalCodes: true,
        departmentCode: true,
        population: true,
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
      select: {
        inseeCode: true,
        name: true,
        normalizedName: true,
        pronounFreeNormalizedName: true,
        postalCodes: true,
        departmentCode: true,
        population: true,
      },
      orderBy: { inseeCode: 'asc' },
    });
    return rows.map(toCommuneRecord);
  }

  public async resolveEpcis(ids: readonly string[]): Promise<CommuneNameResolution> {
    const version = await this.findActiveVersion();
    if (version === null) {
      return {
        inseeCodes: [],
        diagnostics: [
          {
            code: 'epci_unavailable',
            field: 'epci',
            message: 'No active EPCI reference is available',
            severity: 'error',
          },
        ],
      };
    }
    const rows = await this.prisma.epciReference.findMany({
      where: { versionId: version.version, epciId: { in: [...new Set(ids)] }, active: true },
      select: { epciId: true, kind: true, memberships: { select: { communeId: true, quality: true } } },
    });
    const found = new Set(rows.map((row) => row.epciId));
    const missing = ids.find((id) => !found.has(id));
    if (missing !== undefined) {
      return {
        inseeCodes: [],
        diagnostics: [
          {
            code: 'epci_invalid',
            field: 'epci',
            message: `EPCI "${missing}" is not active or does not exist`,
            severity: 'error',
          },
        ],
      };
    }
    const incomplete = rows.find(
      (row) =>
        !isEpciKind(row.kind) ||
        row.memberships.length === 0 ||
        row.memberships.some((membership) => membership.quality !== 'complete'),
    );
    if (incomplete !== undefined) {
      return {
        inseeCodes: [],
        diagnostics: [
          {
            code: 'epci_membership_incomplete',
            field: 'epci',
            message: `EPCI "${incomplete.epciId}" has incomplete membership data`,
            severity: 'error',
          },
        ],
      };
    }
    return {
      inseeCodes: [...new Set(rows.flatMap((row) => row.memberships.map((membership) => membership.communeId)))].sort(),
      diagnostics: [],
    };
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
  population: number | null;
}): CommuneReferenceRecord {
  return {
    inseeCode: row.inseeCode,
    name: row.name,
    normalizedName: row.normalizedName,
    pronounFreeNormalizedName: row.pronounFreeNormalizedName,
    postalCodes: row.postalCodes,
    departmentCode: row.departmentCode,
    ...(row.population === null ? {} : { population: row.population }),
  };
}
