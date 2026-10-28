import { describe, expect, it } from 'vitest';

import { validateDepartment } from '../../src/geography/department-validator.js';
import {
  FakeReferenceReader,
  VERSION,
  activeVersion,
  makeCommune,
  makeDepartment,
} from './fake-reference.js';

const lyon = makeCommune('69123', 'Lyon', '69', ['69001']);
const paris = makeCommune('75101', 'Paris 1er', '75', ['75001']);

function reader(): FakeReferenceReader {
  return new FakeReferenceReader(
    activeVersion(),
    [lyon, paris],
    [makeDepartment('69', 'Rhône'), makeDepartment('75', 'Paris')],
  );
}

describe('validateDepartment', () => {
  it('links the stated department code when it exists', async () => {
    const result = await validateDepartment({ departement: '69' }, lyon, reader(), VERSION);
    expect(result.departmentCode).toBe('69');
    expect(result.departmentSource).toBe('stated');
    expect(result.diagnostics).toEqual([]);
  });

  it('preserves leading zeroes and alphanumeric codes', async () => {
    const custom = new FakeReferenceReader(
      activeVersion(),
      [],
      [makeDepartment('01'), makeDepartment('2A')],
    );
    expect(
      (await validateDepartment({ departement: ' 01 ' }, undefined, custom, VERSION))
        .departmentCode,
    ).toBe('01');
    expect(
      (await validateDepartment({ departement: '2a' }, undefined, custom, VERSION)).departmentCode,
    ).toBe('2A');
  });

  it('falls back to the commune department with a diagnostic when the code is unknown', async () => {
    const result = await validateDepartment({ departement: '99' }, lyon, reader(), VERSION);
    expect(result.departmentCode).toBe('69');
    expect(result.departmentSource).toBe('reference');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'department_code_unknown',
    ]);
  });

  it('keeps both values and diagnoses a stated department disagreeing with the commune', async () => {
    const result = await validateDepartment({ departement: '75' }, lyon, reader(), VERSION);
    expect(result.departmentCode).toBe('75');
    expect(result.departmentSource).toBe('stated');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'department_commune_mismatch',
    ]);
    expect(result.diagnostics[0]?.message).toContain('69');
  });

  it('derives the department from the commune when the event states none', async () => {
    const result = await validateDepartment({}, lyon, reader(), VERSION);
    expect(result.departmentCode).toBe('69');
    expect(result.departmentSource).toBe('reference');
    expect(result.diagnostics).toEqual([]);
  });

  it('returns no department and a diagnostic for an unknown code without a commune', async () => {
    const result = await validateDepartment({ departement: '99' }, undefined, reader(), VERSION);
    expect(result.departmentCode).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'department_code_unknown',
    ]);
  });

  it('returns nothing when neither a code nor a commune exists', async () => {
    expect(await validateDepartment({}, undefined, reader(), VERSION)).toEqual({ diagnostics: [] });
  });
});
