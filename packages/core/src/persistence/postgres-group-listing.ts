import type { PrismaClient } from '@prisma/client';

import { validateAreaIdentifiers } from '../geography/group-area-validator.js';
import { PostgresGeographicReferenceRepository } from './geographic-reference-repository.js';
import {
  groupCalendar,
  type GroupAreaCriteria,
  type GroupAreaDiagnostic,
  type GroupListingItem,
  type GroupListingPaging,
  type GroupListingReader,
  type GroupListingResult,
} from '../models/group-listing.js';

/**
 * The territory listing as one indexed predicate set on the attachment columns written at
 * catalogue synchronization. No spatial work, no join fan-out: a group carries at most one
 * attachment, so it can never be returned twice.
 *
 * Rows are restricted to the active reference version, so a group whose attachment predates an
 * activation is temporarily absent rather than answered with a stale commune.
 */
export class PostgresGroupListing implements GroupListingReader {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findActiveVersion(): Promise<string | null> {
    const row = await this.prisma.geographicReferenceVersion.findFirst({
      where: { status: 'active' },
      select: { version: true },
    });
    return row?.version ?? null;
  }

  public async validateArea(
    version: string,
    identifiers: { readonly department?: string; readonly communeIds?: readonly string[] },
  ): Promise<readonly GroupAreaDiagnostic[]> {
    const repository = new PostgresGeographicReferenceRepository(this.prisma);
    return await validateAreaIdentifiers(repository, version, identifiers);
  }

  public async list(
    criteria: GroupAreaCriteria,
    paging: GroupListingPaging,
  ): Promise<GroupListingResult> {
    const where = {
      scopeKind: 'group',
      mapStatus: 'listed',
      retrievalStatus: 'active',
      displayName: { not: null },
      referenceVersion: criteria.referenceVersion,
      ...(criteria.country === undefined ? {} : { countryCode: criteria.country }),
      ...(criteria.department === undefined ? {} : { departmentCode: criteria.department }),
      ...(criteria.communeIds === undefined || criteria.communeIds.length === 0
        ? {}
        : { communeId: { in: [...criteria.communeIds] } }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.ingestionScope.findMany({
        where,
        orderBy: [{ displayName: 'asc' }, { scopeId: 'asc' }],
        skip: paging.offset,
        take: paging.limit,
        select: {
          scopeId: true,
          displayName: true,
          countryCode: true,
          departmentCode: true,
          departmentName: true,
          communeId: true,
          communeName: true,
          location: { select: { geoPoint: { select: { latitude: true, longitude: true } } } },
        },
      }),
      this.prisma.ingestionScope.count({ where }),
    ]);

    return {
      items: rows.flatMap((row) => (row.displayName === null ? [] : [toItem(row)])),
      total,
      limit: paging.limit,
      offset: paging.offset,
      referenceVersion: criteria.referenceVersion,
    };
  }
}

interface ListingRow {
  readonly scopeId: string;
  readonly displayName: string | null;
  readonly countryCode: string | null;
  readonly departmentCode: string | null;
  readonly departmentName: string | null;
  readonly communeId: string | null;
  readonly communeName: string | null;
  readonly location: {
    readonly geoPoint: { readonly latitude: unknown; readonly longitude: unknown } | null;
  } | null;
}

function toItem(row: ListingRow): GroupListingItem {
  return {
    id: row.scopeId,
    name: row.displayName ?? '',
    countryCode: row.countryCode,
    departmentCode: row.departmentCode,
    departmentName: row.departmentName,
    communeId: row.communeId,
    communeName: row.communeName,
    latitude: toNumber(row.location?.geoPoint?.latitude),
    longitude: toNumber(row.location?.geoPoint?.longitude),
    calendar: groupCalendar(row.scopeId),
  };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
