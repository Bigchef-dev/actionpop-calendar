import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  buildEpciFromCommunes,
  validateEpciReference,
  type CommuneCsvRow,
  type Diagnostic,
  type EpciMembershipRecord,
  type EpciReferenceRecord,
} from '@actionpop/core';

import { joinMemberships, parseGroupementsCsv } from './epci-groupements-csv.js';
import { loadEpciReferenceFile } from './epci-reference-refresh.js';

/** The two optional sources of intercommunal identity; the rest of the input is unused here. */
export interface EpciReferenceSource {
  readonly epciPath?: string;
  readonly epciGroupementsPath?: string;
}

export interface EpciSnapshot {
  references: readonly EpciReferenceRecord[];
  memberships: readonly EpciMembershipRecord[];
  checksum: string;
  diagnostics: readonly Diagnostic[];
}

/**
 * Reads the intercommunal reference: the dedicated export when one is configured, otherwise
 * the `epci_code`/`epci_nom` columns already published in the commune dataset.
 */
export async function readEpciSnapshot(
  input: EpciReferenceSource,
  rows: readonly CommuneCsvRow[],
): Promise<EpciSnapshot> {
  const diagnostics: Diagnostic[] = [];

  if (input.epciGroupementsPath !== undefined) {
    const text = await readFile(input.epciGroupementsPath, 'latin1');
    const parsed = parseGroupementsCsv(text, '');
    for (const error of parsed.errors) {
      diagnostics.push({
        code: 'epci_source_invalid',
        field: 'groupements',
        message: error,
        severity: 'error',
      });
    }
    // One line per refresh: an operator needs the totals, not seven similar warnings.
    const ignored = Object.entries(parsed.ignoredNatures);
    if (ignored.length > 0) {
      const total = ignored.reduce((sum, [, count]) => sum + count, 0);
      const detail = ignored
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([nature, count]) => `${nature} ${count}`)
        .join(', ');
      diagnostics.push(
        warning(
          'nature_juridique',
          `${total} groupement(s) outside the public EPCI categories were skipped (${detail})`,
        ),
      );
    }
    const joined = joinMemberships(parsed.references, rows, '');
    if (joined.territoriesWithoutMember.length > 0) {
      diagnostics.push(
        warning(
          'epci_code',
          `${joined.territoriesWithoutMember.length} territory(ies) have no member commune in the dataset`,
        ),
      );
    }
    return {
      references: joined.references,
      memberships: joined.memberships,
      checksum: checksumOf(joined.references, joined.memberships),
      diagnostics,
    };
  }

  if (input.epciPath === undefined) {
    const derived = buildEpciFromCommunes(rows, '');
    if (derived.unsupported.length > 0) {
      diagnostics.push(
        warning(
          'epci_nom',
          `${derived.unsupported.length} territory(ies) state no supported nature and were skipped`,
        ),
      );
    }
    if (derived.references.length === 0 && rows.length > 0) {
      diagnostics.push(
        warning(
          'epci_nom',
          'the commune dataset carries no intercommunal membership; territories will not be searchable',
        ),
      );
    }
    return {
      references: derived.references,
      memberships: derived.memberships,
      checksum: checksumOf(derived.references, derived.memberships),
      diagnostics,
    };
  }

  const source = await loadEpciReferenceFile(input.epciPath, '');
  for (const nature of source.ignoredNatures ?? []) {
    diagnostics.push(
      warning(
        'nature_epci',
        `nature "${nature}" is outside the public EPCI categories and was skipped`,
      ),
    );
  }
  const found = validateEpciReference({
    references: source.references,
    memberships: source.memberships,
    communeIds: new Set(rows.map((row) => row.inseeCode)),
  });
  for (const diagnostic of found) {
    diagnostics.push({
      code: `epci_${diagnostic.code}`,
      field: 'epci_reference',
      message: diagnostic.message,
      severity: 'error',
    });
  }
  return {
    references: source.references,
    memberships: source.memberships,
    checksum: checksumOf(source.references, source.memberships),
    diagnostics,
  };
}

export function checksumOf(
  references: readonly EpciReferenceRecord[],
  memberships: readonly EpciMembershipRecord[],
): string {
  return createHash('sha256').update(JSON.stringify({ references, memberships })).digest('hex');
}

export function warning(field: string, message: string): Diagnostic {
  return { code: 'epci_nature_unsupported', field, message, severity: 'warning' };
}
