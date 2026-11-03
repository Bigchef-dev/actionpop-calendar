import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  validateEpciReference,
  type EpciMembershipRecord,
  type EpciReferenceDiagnostic,
  type EpciReferenceRecord,
} from '@actionpop/core';

import { parseOfficialEpciCsv } from './epci-official-csv.js';

export interface EpciReferenceSourceDocument {
  readonly version: string;
  readonly source: string;
  readonly publicationDate: string;
  readonly license: string;
  readonly references: readonly EpciReferenceRecord[];
  readonly memberships: readonly EpciMembershipRecord[];
  /** Administrative natures present in the source but outside the public EPCI categories. */
  readonly ignoredNatures?: readonly string[];
}

export interface EpciRefreshResult {
  readonly version: string;
  readonly status: 'valid' | 'rejected';
  readonly checksum: string;
  readonly diagnostics: readonly EpciReferenceDiagnostic[];
  readonly counts: { readonly references: number; readonly memberships: number };
}

/**
 * Loads the normalized adapter output. Source-specific downloads stay outside this
 * module; this boundary only accepts the versioned, validated shape used by storage.
 */
export async function readEpciReferenceSource(path: string): Promise<EpciReferenceSourceDocument> {
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isSourceDocument(raw)) {
    throw new Error('EPCI reference source has an invalid normalized shape');
  }
  return raw;
}

/**
 * Loads either the normalized JSON shape or the raw official CSV export of EPCI
 * memberships, so an operator can point the refresh at the published dataset directly.
 */
export async function loadEpciReferenceFile(
  path: string,
  versionId: string,
): Promise<EpciReferenceSourceDocument> {
  if (/[.](csv|txt)$/i.test(path)) {
    const content = await readFile(path, 'utf8');
    const parsed = parseOfficialEpciCsv(content.split(/\r?\n/), { versionId });
    if (parsed.errors.length > 0) {
      throw new Error(`EPCI reference source is invalid: ${parsed.errors.slice(0, 3).join('; ')}`);
    }
    return {
      version: versionId,
      source: path,
      publicationDate: publicationDateOf(path),
      license: 'Licence Ouverte 2.0',
      references: parsed.references,
      memberships: parsed.memberships,
      ignoredNatures: parsed.ignoredNatures,
    };
  }
  return await readEpciReferenceSource(path);
}

/** The official exports carry their date in the file name, e.g. `epci-2026-01-01.csv`. */
function publicationDateOf(path: string): string {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(path);
  return match?.[1] ?? new Date().toISOString().slice(0, 10);
}

export async function validateEpciReferenceSource(
  path: string,
  communeIds: ReadonlySet<string>,
  versionId = publicationDateOf(path),
): Promise<EpciRefreshResult> {
  const document = await loadEpciReferenceFile(path, versionId);
  const diagnostics = validateEpciReference({
    references: document.references,
    memberships: document.memberships,
    communeIds,
  });
  const checksum = createHash('sha256')
    .update(JSON.stringify(document))
    .digest('hex');
  return {
    version: document.version,
    status: diagnostics.length === 0 ? 'valid' : 'rejected',
    checksum,
    diagnostics,
    counts: {
      references: document.references.length,
      memberships: document.memberships.length,
    },
  };
}

function isSourceDocument(value: unknown): value is EpciReferenceSourceDocument {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.publicationDate === 'string' &&
    typeof candidate.license === 'string' &&
    Array.isArray(candidate.references) &&
    Array.isArray(candidate.memberships)
  );
}
