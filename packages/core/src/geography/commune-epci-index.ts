import { normalizeGeographicName } from '../domain/geographic-identity.js';
import type { CommuneCsvRow } from './commune-csv-parser.js';
import {
  normalizeEpciName,
  type EpciKind,
  type EpciMembershipRecord,
  type EpciReferenceRecord,
} from './epci-reference.js';

/** Official placeholder for a commune that belongs to no intercommunal territory. */
const NO_TERRITORY_PLACEHOLDER = /^Z+$/;

export interface EpciFromCommunesResult {
  readonly references: readonly EpciReferenceRecord[];
  readonly memberships: readonly EpciMembershipRecord[];
  /** Territories whose official label does not state a supported nature. */
  readonly unsupported: readonly { id: string; name: string }[];
}

/**
 * Derives the intercommunal reference from the published commune dataset, which already
 * carries `epci_code` and `epci_nom` for every commune.
 *
 * The official labels state the nature by prefix (`CC`, `CA`, `CU`) or by the word
 * `Métropole`. Prefixes win, so a communauté d'agglomération whose name mentions a
 * métropole is not promoted to `METRO`. A territory whose label states nothing supported
 * (for example the placeholder used for communes without an EPCI) is reported, not guessed.
 */
export function buildEpciFromCommunes(
  rows: readonly CommuneCsvRow[],
  versionId: string,
): EpciFromCommunesResult {
  const territories = new Map<string, MutableTerritory>();
  const memberships: EpciMembershipRecord[] = [];
  const unsupported = new Map<string, string>();

  for (const row of rows) {
    const id = row.epciCode?.trim() ?? '';
    if (id === '' || row.inseeCode.trim() === '') continue;
    // The published dataset marks communes without any intercommunal membership with a
    // placeholder; it is not a territory and must not be reported as an anomaly.
    if (NO_TERRITORY_PLACEHOLDER.test(id)) continue;
    const name = (row.epciName ?? '').trim();
    const kind = natureOf(name);

    if (kind === undefined) {
      unsupported.set(id, name === '' ? id : name);
      continue;
    }

    const territory = territories.get(id);
    if (territory === undefined) {
      territories.set(id, {
        name: name === '' ? id : name,
        kind,
        departmentCodes: new Set([row.departmentCode]),
      });
    } else {
      territory.departmentCodes.add(row.departmentCode);
    }

    memberships.push({
      versionId,
      epciId: id,
      communeId: row.inseeCode,
      quality: 'complete',
    });
  }

  const references = [...territories.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, territory]): EpciReferenceRecord => ({
      versionId,
      id,
      name: territory.name,
      normalizedName: normalizeEpciName(territory.name),
      kind: territory.kind,
      departmentCodes: [...territory.departmentCodes].filter((code) => code !== '').sort(),
      active: true,
    }));

  return {
    references,
    memberships,
    unsupported: [...unsupported.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

interface MutableTerritory {
  name: string;
  kind: EpciKind;
  departmentCodes: Set<string>;
}

/** Public nature stated by an official EPCI label, or `undefined` when it states none. */
export function natureOf(name: string): EpciKind | undefined {
  const normalized = normalizeGeographicName(name);
  if (normalized.startsWith('cc ')) return 'CC';
  if (normalized.startsWith('ca ')) return 'CA';
  if (normalized.startsWith('cu ')) return 'CU';
  if (normalized.includes('metropole')) return 'METRO';
  return undefined;
}
