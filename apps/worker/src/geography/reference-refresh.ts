import { readFile } from 'node:fs/promises';

import {
  buildReferenceIndex,
  hasBlockingDiagnostics,
  parseCommuneCsvLines,
  validateReference,
  type Diagnostic,
} from '@actionpop/core';

import type { PostgresGeographicReferenceWriter } from '@actionpop/core';

export interface RefreshGeographicReferenceInput {
  communesPath: string;
  source: string;
  publicationDate: string;
  license: string;
  minimumCommuneCount?: number;
}

export interface RefreshGeographicReferenceResult {
  version: string;
  status: 'staged' | 'active' | 'rejected';
  diagnostics: Diagnostic[];
  counts: { communes: number; departments: number };
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
  const counts = {
    communes: index.communes.length,
    departments: index.departments.length,
  };
  const version = buildVersionId(input.publicationDate, index.checksum);

  if (hasBlockingDiagnostics(diagnostics)) {
    return { version, status: 'rejected', diagnostics, counts };
  }

  await writer.stage({
    version,
    source: input.source,
    publicationDate: input.publicationDate,
    license: input.license,
    index,
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
