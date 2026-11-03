import { normalizeEpciName, type EpciKind, type EpciMembershipRecord, type EpciReferenceRecord } from '@actionpop/core';

export interface ParsedEpciCsv {
  readonly references: readonly EpciReferenceRecord[];
  readonly memberships: readonly EpciMembershipRecord[];
  readonly errors: readonly string[];
}

/**
 * Parses the normalized two-table CSV export used by the worker adapter.
 * The first section contains EPCI rows and the second contains memberships.
 */
export function parseEpciCsv(text: string, versionId: string): ParsedEpciCsv {
  const sections = text.split(/\n\s*\n/);
  const references: EpciReferenceRecord[] = [];
  const memberships: EpciMembershipRecord[] = [];
  const errors: string[] = [];
  parseRows(sections[0] ?? '', (columns, line) => {
    const [id, name, kind, departments, active] = columns;
    if (id === undefined || name === undefined || !isKind(kind)) {
      errors.push(`invalid EPCI row ${line}`);
      return;
    }
    references.push({
      versionId,
      id,
      name,
      normalizedName: normalizeEpciName(name),
      kind,
      departmentCodes: (departments ?? '').split('|').filter(Boolean),
      active: active !== 'false',
    });
  });
  parseRows(sections[1] ?? '', (columns, line) => {
    const [epciId, communeId, quality] = columns;
    if (epciId === undefined || communeId === undefined) {
      errors.push(`invalid membership row ${line}`);
      return;
    }
    memberships.push({
      versionId,
      epciId,
      communeId,
      quality: quality === 'unverified' ? 'unverified' : 'complete',
    });
  });
  return { references, memberships, errors };
}

function parseRows(section: string, callback: (columns: string[], line: number) => void): void {
  for (const [index, raw] of section.split(/\r?\n/).entries()) {
    if (index === 0 || raw.trim() === '') continue;
    callback(raw.split(',').map((value) => value.trim()), index + 1);
  }
}

function isKind(value: string | undefined): value is EpciKind {
  return value === 'CC' || value === 'CA' || value === 'CU' || value === 'METRO';
}