import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  buildReferenceIndex,
  hasBlockingDiagnostics,
  parseCommuneCsvLines,
  validateReference,
  type Diagnostic,
} from '@actionpop/core';

import type { PostgresGeographicReferenceWriter } from '@actionpop/core';
import { readEpciSnapshot } from './epci-snapshot.js';

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

export function buildVersionId(publicationDate: string, checksum: string): string {
  return `communes-${publicationDate.replace(/[^0-9A-Za-z]/g, '')}-${checksum.slice(0, 12)}`;
}
