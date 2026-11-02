import {
  normalizeEpciName,
  type EpciKind,
  type EpciMembershipRecord,
  type EpciReferenceRecord,
} from '@actionpop/core';

export interface OfficialEpciParseResult {
  readonly references: readonly EpciReferenceRecord[];
  readonly memberships: readonly EpciMembershipRecord[];
  readonly errors: readonly string[];
  /** Rows whose administrative nature is outside the four public EPCI categories. */
  readonly ignoredNatures: readonly string[];
}

export interface OfficialEpciParseOptions {
  readonly versionId: string;
  /** Official publication state; a territory marked inactive is kept but not searchable. */
  readonly activeIds?: ReadonlySet<string>;
}

const COMMUNE_COLUMNS = ['codgeo', 'code_commune', 'code_insee', 'insee_commune'];
const EPCI_ID_COLUMNS = ['epci', 'cod_epci', 'code_epci', 'siren_epci'];
const EPCI_NAME_COLUMNS = ['libepci', 'lib_epci', 'nom_epci'];
const NATURE_COLUMNS = ['nature_epci', 'nat_epci', 'nature'];
const ACTIVE_COLUMNS = ['active', 'etat', 'statut'];

const SUPPORTED_NATURES: Record<string, EpciKind> = {
  CC: 'CC',
  CA: 'CA',
  CU: 'CU',
  METRO: 'METRO',
  MET: 'METRO',
};

/**
 * Reads the official "table d'appartenance des communes aux EPCI" export (INSEE / DILA).
 *
 * Every row carries one commune and its territory, so identities are deduplicated while
 * memberships are kept one row per commune. Natures outside the four public EPCI
 * categories (SIVU, SIVOM, PETR, syndicats mixtes…) are reported and skipped instead of
 * being published as territories.
 */
export function parseOfficialEpciCsv(
  lines: readonly string[],
  options: OfficialEpciParseOptions,
): OfficialEpciParseResult {
  const errors: string[] = [];
  const references = new Map<string, MutableReference>();
  const ignoredNatures = new Set<string>();
  const memberships: EpciMembershipRecord[] = [];
  const seenMemberships = new Set<string>();

  if (lines.length === 0) {
    return { references: [], memberships: [], errors: ['the EPCI file is empty'], ignoredNatures: [] };
  }

  const header = splitRow(lines[0] ?? '').map((value) => value.toLowerCase());
  const communeIndex = findColumn(header, COMMUNE_COLUMNS);
  const idIndex = findColumn(header, EPCI_ID_COLUMNS);
  const nameIndex = findColumn(header, EPCI_NAME_COLUMNS);
  const natureIndex = findColumn(header, NATURE_COLUMNS);
  const activeIndex = findColumn(header, ACTIVE_COLUMNS);

  if (communeIndex === -1 || idIndex === -1 || nameIndex === -1 || natureIndex === -1) {
    return {
      references: [],
      memberships: [],
      errors: [
        'the EPCI file must expose a commune code, an EPCI identifier, an EPCI name and a nature',
      ],
      ignoredNatures: [],
    };
  }

  for (let lineNumber = 1; lineNumber < lines.length; lineNumber += 1) {
    const raw = lines[lineNumber] ?? '';
    if (raw.trim() === '') continue;
    const columns = splitRow(raw);

    const communeId = (columns[communeIndex] ?? '').trim();
    const epciId = (columns[idIndex] ?? '').trim();
    const name = (columns[nameIndex] ?? '').trim();
    const nature = (columns[natureIndex] ?? '').trim().toUpperCase();

    if (communeId === '' || epciId === '' || name === '') {
      errors.push(`row ${lineNumber + 1}: missing commune, EPCI identifier or name`);
      continue;
    }

    const kind = SUPPORTED_NATURES[nature];
    if (kind === undefined) {
      ignoredNatures.add(nature === '' ? 'unknown' : nature);
      continue;
    }

    const existing = references.get(epciId);
    const departmentCode = departmentOf(communeId);
    if (existing === undefined) {
      references.set(epciId, {
        name,
        kind,
        departmentCodes: new Set(departmentCode === undefined ? [] : [departmentCode]),
        active: readActive(columns[activeIndex], options.activeIds, epciId),
      });
    } else if (departmentCode !== undefined) {
      existing.departmentCodes.add(departmentCode);
    }

    const membershipKey = `${epciId}:${communeId}`;
    if (seenMemberships.has(membershipKey)) {
      errors.push(`row ${lineNumber + 1}: duplicate membership for "${epciId}" and "${communeId}"`);
      continue;
    }
    seenMemberships.add(membershipKey);
    memberships.push({
      versionId: options.versionId,
      epciId,
      communeId,
      quality: 'complete',
    });
  }

  const ordered = [...references.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, value]): EpciReferenceRecord => {
      const name = value.name;
      return {
        versionId: options.versionId,
        id,
        name,
        normalizedName: normalizeEpciName(name),
        kind: value.kind,
        departmentCodes: [...value.departmentCodes].sort(),
        active: value.active,
      };
    });

  return { references: ordered, memberships, errors, ignoredNatures: [...ignoredNatures].sort() };
}

interface MutableReference {
  name: string;
  kind: EpciKind;
  departmentCodes: Set<string>;
  active: boolean;
}

function readActive(
  value: string | undefined,
  activeIds: ReadonlySet<string> | undefined,
  epciId: string,
): boolean {
  const stated = (value ?? '').trim().toLowerCase();
  if (stated !== '' && ['false', '0', 'inactive', 'supprime', 'supprimé'].includes(stated)) {
    return false;
  }
  if (activeIds !== undefined && !activeIds.has(epciId)) return false;
  return true;
}

/** Department of a commune code, keeping the Corsican "2A"/"2B" form intact. */
export function departmentOf(communeId: string): string | undefined {
  if (communeId.length < 2) return undefined;
  const prefix = communeId.slice(0, 2).toUpperCase();
  if (prefix === '2A' || prefix === '2B') return prefix;
  const digits = communeId.slice(0, 2);
  return /^\d{2}$/.test(digits) ? digits : undefined;
}

function findColumn(header: readonly string[], candidates: readonly string[]): number {
  for (const candidate of candidates) {
    const index = header.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}

/** Minimal CSV splitter: official exports quote with `"` and escape by doubling it. */
function splitRow(row: string): string[] {
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
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}
