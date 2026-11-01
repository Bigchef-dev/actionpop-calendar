import type { PrismaClient } from '@prisma/client';

import { normalizeSubjectQuery } from './subject-ranking.js';
import type {
  SubjectCandidate,
  SubjectKind,
  SubjectQuery,
  SubjectReadResult,
  SubjectSearchReader,
} from './subject-search-types.js';

/** Upper bound of rows a single kind scan may load before ranking filters them. */
const GROUP_SCAN_LIMIT = 50_000;

/**
 * Reads search candidates from the data the project already holds: the active geographic
 * reference version for communes and departments, and active group scopes for action groups.
 */
export class PostgresSubjectSearch implements SubjectSearchReader {
  public constructor(private readonly prisma: PrismaClient) {}

  public async read(
    kind: SubjectKind,
    query: SubjectQuery,
    candidateLimit: number,
  ): Promise<SubjectReadResult> {
    switch (kind) {
      case 'commune':
        return await this.readCommunes(query, candidateLimit);
      case 'department':
        return await this.readDepartments(query, candidateLimit);
      case 'group':
        return await this.readGroups(query, candidateLimit);
    }
  }

  private async activeVersion(): Promise<string | undefined> {
    const version = await this.prisma.geographicReferenceVersion.findFirst({
      where: { status: 'active' },
      select: { version: true },
    });
    return version?.version;
  }

  private async readCommunes(
    query: SubjectQuery,
    candidateLimit: number,
  ): Promise<SubjectReadResult> {
    const normalizedQuery = query.normalized;
    const versionId = await this.activeVersion();
    if (versionId === undefined) return { candidates: [], total: 0 };

    const where = {
      versionId,
      OR: [
        { normalizedName: { startsWith: normalizedQuery } },
        { pronounFreeNormalizedName: { startsWith: normalizedQuery } },
        { normalizedName: { contains: normalizedQuery } },
        { pronounFreeNormalizedName: { contains: normalizedQuery } },
        { postalCodes: { has: normalizedQuery } },
        { inseeCode: query.raw },
      ],
    };

    const [rows, total, departments] = await Promise.all([
      this.prisma.communeReference.findMany({
        where,
        // Biggest places first, so the candidate window the ranking receives is the useful one.
        orderBy: [
          { population: { sort: 'desc', nulls: 'last' } },
          { departmentCode: 'asc' },
          { inseeCode: 'asc' },
        ],
        take: candidateLimit,
        select: {
          inseeCode: true,
          name: true,
          departmentCode: true,
          postalCodes: true,
          population: true,
        },
      }),
      this.prisma.communeReference.count({ where }),
      this.prisma.departmentReference.findMany({
        where: { versionId },
        select: { code: true, name: true },
      }),
    ]);

    const departmentNames = new Map(departments.map((row) => [row.code, row.name]));

    const candidates: SubjectCandidate[] = rows.map((row) => {
      const departmentName = departmentNames.get(row.departmentCode);
      return {
        kind: 'commune',
        id: row.inseeCode,
        label: row.name,
        ...(departmentName === undefined
          ? {}
          : { qualifier: departmentName, parent: departmentName }),
        calendar: { path: '/calendar.ics', params: { insee_commune: row.inseeCode } },
        aliases: row.postalCodes,
        sortKey: `${row.departmentCode}:${row.inseeCode}`,
        ...(row.population === null ? {} : { population: row.population }),
      };
    });

    return { candidates, total };
  }

  private async readDepartments(
    query: SubjectQuery,
    candidateLimit: number,
  ): Promise<SubjectReadResult> {
    const normalizedQuery = query.normalized;
    const rawId = query.raw.toUpperCase();
    const versionId = await this.activeVersion();
    if (versionId === undefined) return { candidates: [], total: 0 };

    const rows = await this.prisma.departmentReference.findMany({
      where: { versionId },
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    });

    const matches = rows.filter((row) => {
      const name = normalizeSubjectQuery(row.name);
      return (
        row.code === rawId ||
        name.startsWith(normalizedQuery) ||
        name.includes(normalizedQuery) ||
        row.code.startsWith(rawId)
      );
    });

    const candidates: SubjectCandidate[] = matches.slice(0, candidateLimit).map((row) => ({
      kind: 'department',
      id: row.code,
      label: row.name,
      calendar: { path: '/calendar.ics', params: { department: row.code } },
      aliases: [row.code],
      sortKey: row.code,
    }));

    return { candidates, total: matches.length };
  }

  private async readGroups(
    query: SubjectQuery,
    candidateLimit: number,
  ): Promise<SubjectReadResult> {
    const normalizedQuery = query.normalized;
    const rawId = query.raw.toLowerCase();
    const rows = await this.prisma.ingestionScope.findMany({
      where: { scopeKind: 'group', retrievalStatus: 'active', displayName: { not: null } },
      orderBy: { scopeId: 'asc' },
      take: GROUP_SCAN_LIMIT,
      select: { scopeId: true, displayName: true },
    });

    const matches: SubjectCandidate[] = [];
    for (const row of rows) {
      if (row.displayName === null) continue;
      const name = normalizeSubjectQuery(row.displayName);
      const answersToId = row.scopeId.toLowerCase() === rawId;
      if (!answersToId && !name.startsWith(normalizedQuery) && !name.includes(normalizedQuery)) {
        continue;
      }
      matches.push({
        kind: 'group',
        id: row.scopeId,
        label: row.displayName,
        calendar: { path: '/calendar.ics', params: { group: row.scopeId } },
        sortKey: `${row.displayName.length}`.padStart(6, '0') + row.displayName,
      });
    }

    matches.sort((left, right) => (left.sortKey ?? '').localeCompare(right.sortKey ?? '', 'fr'));
    return { candidates: matches.slice(0, candidateLimit), total: matches.length };
  }
}
