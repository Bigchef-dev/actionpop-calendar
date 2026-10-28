import type { IndexedReference } from './commune-name-index.js';
import type { Diagnostic } from './reference-types.js';

export interface ReferenceValidationInput {
  index: IndexedReference;
  source: string;
  publicationDate: string;
  license: string;
  parseErrors: string[];
  minimumCommuneCount?: number;
}

const DEFAULT_MINIMUM_COMMUNES = 1000;

export function validateReference(input: ReferenceValidationInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const minimum = input.minimumCommuneCount ?? DEFAULT_MINIMUM_COMMUNES;

  if (input.source.trim() === '')
    diagnostics.push(
      error('reference_source_missing', 'source', 'a source identifier is required'),
    );
  if (input.publicationDate.trim() === '')
    diagnostics.push(
      error(
        'reference_publication_date_missing',
        'publicationDate',
        'a publication date is required',
      ),
    );
  if (input.license.trim() === '')
    diagnostics.push(error('reference_license_missing', 'license', 'license metadata is required'));

  for (const message of input.parseErrors) {
    diagnostics.push(error('reference_csv_invalid', 'communesPath', message));
  }

  const seen = new Set<string>();
  for (const commune of input.index.communes) {
    if (seen.has(commune.inseeCode)) {
      diagnostics.push(
        error(
          'reference_duplicate_identifier',
          'code_insee',
          `duplicate INSEE code "${commune.inseeCode}"`,
        ),
      );
      continue;
    }
    seen.add(commune.inseeCode);

    if (commune.name.trim() === '') {
      diagnostics.push(
        error(
          'reference_commune_name_missing',
          'nom_standard',
          `commune "${commune.inseeCode}" has no name`,
        ),
      );
    }
    if (commune.departmentCode.trim() === '') {
      diagnostics.push(
        error(
          'reference_department_missing',
          'dep_code',
          `commune "${commune.inseeCode}" has no department`,
        ),
      );
    }
  }

  const departmentCodes = new Set(input.index.departments.map((department) => department.code));
  for (const commune of input.index.communes) {
    if (commune.departmentCode !== '' && !departmentCodes.has(commune.departmentCode)) {
      diagnostics.push(
        error(
          'reference_department_missing',
          'dep_code',
          `commune "${commune.inseeCode}" references unknown department "${commune.departmentCode}"`,
        ),
      );
    }
  }

  if (input.index.communes.length < minimum) {
    diagnostics.push(
      error(
        'reference_coverage_insufficient',
        'communes',
        `only ${input.index.communes.length} communes were accepted; at least ${minimum} are required`,
      ),
    );
  }

  return diagnostics;
}

export function hasBlockingDiagnostics(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function error(code: string, field: string, message: string): Diagnostic {
  return { code, field, message, severity: 'error' };
}
