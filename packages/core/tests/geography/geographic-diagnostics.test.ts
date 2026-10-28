import { describe, expect, it } from 'vitest';

import { isKnownDiagnostic, severityOf } from '../../src/geography/diagnostics.js';
import { enrichEventGeography } from '../../src/geography/geographic-enricher.js';
import { validateEventType } from '../../src/geography/event-types.js';
import {
  FakeReferenceReader,
  VERSION,
  activeVersion,
  makeCommune,
  makeDepartment,
} from './fake-reference.js';

describe('diagnostic severity mapping', () => {
  it('maps enrichment problems to warnings', () => {
    expect(severityOf('commune_unknown')).toBe('warning');
    expect(severityOf('commune_match_ambiguous')).toBe('warning');
    expect(severityOf('commune_name_missing')).toBe('warning');
    expect(severityOf('department_code_unknown')).toBe('warning');
    expect(severityOf('department_commune_mismatch')).toBe('warning');
    expect(severityOf('country_missing')).toBe('warning');
    expect(severityOf('country_unsupported')).toBe('warning');
  });

  it('maps rejection causes to errors', () => {
    expect(severityOf('event_type_invalid')).toBe('error');
    expect(severityOf('reference_unavailable')).toBe('error');
    expect(severityOf('reference_coverage_insufficient')).toBe('error');
    expect(severityOf('reference_duplicate_identifier')).toBe('error');
  });

  it('recognizes documented codes only', () => {
    expect(isKnownDiagnostic('commune_unknown')).toBe(true);
    expect(isKnownDiagnostic('made_up')).toBe(false);
  });
});

describe('diagnostics never leak payload content beyond the stated value', () => {
  const reader = new FakeReferenceReader(
    activeVersion(),
    [makeCommune('69123', 'Lyon', '69')],
    [makeDepartment('69')],
  );

  it('keeps an actionable field and cause for an unknown commune', async () => {
    const result = await enrichEventGeography(
      { country: 'FR', communeName: 'Ville Inexistante' },
      reader,
    );
    const diagnostic = result.diagnostics.find((entry) => entry.code === 'commune_unknown');
    expect(diagnostic).toMatchObject({ field: 'location.commune.name', severity: 'warning' });
    expect(diagnostic?.message).toContain('Ville Inexistante');
  });

  it('uses the error severity only for a rejection cause', async () => {
    const empty = new FakeReferenceReader(null, [], []);
    const unavailable = await enrichEventGeography({ country: 'FR' }, empty);
    expect(unavailable.diagnostics.every((diagnostic) => diagnostic.severity === 'error')).toBe(
      true,
    );

    const incomplete = await enrichEventGeography(
      { country: 'FR', communeName: 'Ville Inexistante' },
      reader,
    );
    expect(incomplete.diagnostics.every((diagnostic) => diagnostic.severity === 'warning')).toBe(
      true,
    );
  });

  it('reports a malformed type as an error naming the field', async () => {
    const result = await validateEventType('Type Invalide', {
      findEventType: async () => null,
      recordObservedEventTypes: async () => undefined,
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: 'event_type_invalid',
      field: 'subtype.label',
      severity: 'error',
    });
  });
});

void VERSION;
