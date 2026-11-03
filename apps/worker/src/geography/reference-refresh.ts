import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  buildEpciFromCommunes,
  buildReferenceIndex,
  hasBlockingDiagnostics,
  parseCommuneCsvLines,
  validateEpciReference,
  validateReference,
  type CommuneCsvRow,
  type Diagnostic,
  type EpciMembershipRecord,
  type EpciReferenceRecord,
} from '@actionpop/core';

import type { PostgresGeographicReferenceWriter } from '@actionpop/core';
import { loadEpciReferenceFile } from './epci-reference-refresh.js';
import { joinMemberships, parseGroupementsCsv } from './epci-groupements-csv.js';

export interface RefreshGeographicReferenceInput {
  communesPath: string;
  source: string;
  publicationDate: string;
  license: string;
  minimumCommuneCount?: number;
  /** Optional dedicated EPCI export; without it the intercommunal reference is derived. */
  epciPath?: string;
  /**
   * Official "liste des groupements" export: the authority for territory identity and
   * nature. Membership is joined from the commune dataset on the SIREN.
   */
  epciGroupementsPath?: string;
}

export interface RefreshGeographicReferenceResult {
  version: string;
  status: 'staged' | 'active' | 'rejected';
  diagnostics: Diagnostic[];
  counts: { communes: number; departments: number; epcis: number; memberships: number };
}

export async function refreshGeographicReference(
  input: RefreshGeographicReferenceInput,
  writer: PostgresGeographicReferenceWriter,
): Promise<RefreshGeographicReferenceResult> {
  const content = await readFile(input.communesPath, 'utf8');
  const parsed = parseCommuneCsvLines(content.split(/\r?\n/));
  const index = buildReferenceIndex(parsed.rows);
  const diagnostics = validateReference({
    index,
    source: input.source,
    publicationDate: input.publicationDate,
    license: input.license,
    parseErrors: parsed.errors,
    ...(input.minimumCommuneCount === undefined
      ? {}
      : { minimumCommuneCount: input.minimumCommuneCount }),
  });

  const territory = await readEpciSnapshot(input, parsed.rows);
  diagnostics.push(...territory.diagnostics);

  // The intercommunal membership is part of the snapshot: a reference imported before the
  // territories existed must be replaced, not skipped as already staged.
  // Hash the combination so the identity reflects both parts of the snapshot; truncating a
  // concatenation would only ever read the first checksum.
  const snapshotChecksum = createHash('sha256')
    .update(`${index.checksum}:${territory.checksum}`)
    .digest('hex');
  const version = buildVersionId(input.publicationDate, snapshotChecksum);
  const epcis = territory.references.map((reference) => ({ ...reference, versionId: version }));
  const epciMemberships = territory.memberships.map((membership) => ({
    ...membership,
    versionId: version,
  }));

  const counts = {
    communes: index.communes.length,
    departments: index.departments.length,
    epcis: epcis.length,
    memberships: epciMemberships.length,
  };

  if (hasBlockingDiagnostics(diagnostics)) {
    return { version, status: 'rejected', diagnostics, counts };
  }

  await writer.stage({
    version,
    source: input.source,
    publicationDate: input.publicationDate,
    license: input.license,
    index,
    epcis,
    epciMemberships,
  });

  const activation = await writer.activate(version);
  if (activation.status === 'retryable') {
    return { version, status: 'staged', diagnostics: activation.diagnostics, counts };
  }

  return { version, status: 'active', diagnostics, counts };
}

interface EpciSnapshot {
  references: readonly EpciReferenceRecord[];
  memberships: readonly EpciMembershipRecord[];
  checksum: string;
  diagnostics: readonly Diagnostic[];
}

/**
 * Reads the intercommunal reference: the dedicated export when one is configured, otherwise
 * the `epci_code`/`epci_nom` columns already published in the commune dataset.
 */
async function readEpciSnapshot(
  input: RefreshGeographicReferenceInput,
  rows: readonly CommuneCsvRow[],
): Promise<EpciSnapshot> {
  const diagnostics: Diagnostic[] = [];

  if (input.epciGroupementsPath !== undefined) {
    const text = await readFile(input.epciGroupementsPath, 'latin1');
    const parsed = parseGroupementsCsv(text, '');
    for (const error of parsed.errors) {
      diagnostics.push({ code: 'epci_source_invalid', field: 'groupements', message: error, severity: 'error' });
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

function checksumOf(
  references: readonly EpciReferenceRecord[],
  memberships: readonly EpciMembershipRecord[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ references, memberships }))
    .digest('hex');
}

function warning(field: string, message: string): Diagnostic {
  return { code: 'epci_nature_unsupported', field, message, severity: 'warning' };
}

export function buildVersionId(publicationDate: string, checksum: string): string {
  return `communes-${publicationDate.replace(/[^0-9A-Za-z]/g, '')}-${checksum.slice(0, 12)}`;
}
