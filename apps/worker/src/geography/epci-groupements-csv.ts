import {
  normalizeEpciName,
  type EpciKind,
  type EpciMembershipRecord,
  type EpciReferenceRecord,
} from '@actionpop/core';

export interface GroupementsParseResult {
  readonly references: readonly EpciReferenceRecord[];
  /** Natures present in the export but outside the public EPCI categories, with counts. */
  readonly ignoredNatures: Readonly<Record<string, number>>;
  readonly errors: readonly string[];
}

/** Official `Nature juridique` codes that describe a public intercommunal territory. */
const PUBLIC_NATURES: Record<string, EpciKind> = {
  CC: 'CC',
  CA: 'CA',
  CU: 'CU',
  METRO: 'METRO',
  // The Métropole de Lyon has its own official code.
  MET69: 'METRO',
};

const REQUIRED_COLUMNS = ['N° SIREN', 'Nom du groupement', 'Nature juridique'] as const;

/**
 * Reads the official "liste des groupements" export: one row per groupement, with its
 * SIREN, its public name and its legal nature.
 *
 * This export is the authority for identity and nature. It carries no membership, which is
 * read from the commune dataset and joined on the SIREN.
 */
export function parseGroupementsCsv(
  text: string,
  versionId: string,
): GroupementsParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const errors: string[] = [];
  const ignoredNatures: Record<string, number> = {};
  const references = new Map<string, EpciReferenceRecord>();

  if (lines.length === 0) {
    return { references: [], ignoredNatures, errors: ['the groupements file is empty'] };
  }

  const header = splitSemicolonRow(lines[0] ?? '');
  const columns = new Map(header.map((name, index) => [normalizeHeader(name), index]));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(normalizeHeader(column)));
  if (missing.length > 0) {
    return {
      references: [],
      ignoredNatures,
      errors: [`missing required column(s): ${missing.join(', ')}`],
    };
  }

  const sirenIndex = columns.get(normalizeHeader('N° SIREN')) ?? -1;
  const nameIndex = columns.get(normalizeHeader('Nom du groupement')) ?? -1;
  const natureIndex = columns.get(normalizeHeader('Nature juridique')) ?? -1;

  for (let lineNumber = 1; lineNumber < lines.length; lineNumber += 1) {
    const row = splitSemicolonRow(lines[lineNumber] ?? '');
    const id = (row[sirenIndex] ?? '').trim();
    const name = (row[nameIndex] ?? '').trim();
    const nature = (row[natureIndex] ?? '').trim().toUpperCase();

    if (id === '' || name === '') {
      errors.push(`row ${lineNumber + 1}: missing SIREN or name`);
      continue;
    }

    const kind = PUBLIC_NATURES[nature];
    if (kind === undefined) {
      ignoredNatures[nature === '' ? 'unknown' : nature] =
        (ignoredNatures[nature === '' ? 'unknown' : nature] ?? 0) + 1;
      continue;
    }

    references.set(id, {
      versionId,
      id,
      name,
      normalizedName: normalizeEpciName(name),
      kind,
      departmentCodes: [],
      active: true,
    });
  }

  return {
    references: [...references.values()].sort((left, right) => left.id.localeCompare(right.id)),
    ignoredNatures,
    errors,
  };
}

/**
 * Joins the official identities with the commune dataset, which states each commune's
 * territory. Departments come from the member communes, so a territory spanning several
 * departments is described accurately.
 */
export function joinMemberships(
  references: readonly EpciReferenceRecord[],
  communes: readonly { inseeCode: string; departmentCode: string; epciCode?: string }[],
  versionId: string,
): {
  references: readonly EpciReferenceRecord[];
  memberships: readonly EpciMembershipRecord[];
  territoriesWithoutMember: readonly string[];
  communesWithoutTerritory: number;
} {
  const departments = new Map<string, Set<string>>();
  const memberships: EpciMembershipRecord[] = [];
  const known = new Set(references.map((reference) => reference.id));
  let communesWithoutTerritory = 0;

  for (const commune of communes) {
    const epciId = commune.epciCode?.trim() ?? '';
    if (epciId === '' || !known.has(epciId)) {
      communesWithoutTerritory += 1;
      continue;
    }
    const codes = departments.get(epciId) ?? new Set<string>();
    if (commune.departmentCode !== '') codes.add(commune.departmentCode);
    departments.set(epciId, codes);
    memberships.push({
      versionId,
      epciId,
      communeId: commune.inseeCode,
      quality: 'complete',
    });
  }

  return {
    references: references.map((reference) => ({
      ...reference,
      departmentCodes: [...(departments.get(reference.id) ?? [])].sort(),
    })),
    memberships,
    territoriesWithoutMember: references
      .filter((reference) => !departments.has(reference.id))
      .map((reference) => reference.id),
    communesWithoutTerritory,
  };
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The official export is semicolon-separated and quotes only values containing `;`. */
function splitSemicolonRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index] ?? '';
    if (quoted) {
      if (character === '"') {
        if (row[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ';') {
      values.push(current);
      current = '';
    } else current += character;
  }
  values.push(current);
  return values;
}
