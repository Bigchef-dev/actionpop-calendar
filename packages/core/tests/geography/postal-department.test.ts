import { describe, expect, it } from 'vitest';

import { departmentFromPostalCode } from '../../src/geography/postal-department.js';

describe('departmentFromPostalCode', () => {
  it('derives a metropolitan department from the postal prefix', () => {
    expect(departmentFromPostalCode('75005')).toBe('75');
    expect(departmentFromPostalCode('69001')).toBe('69');
    expect(departmentFromPostalCode('01000')).toBe('01');
    expect(departmentFromPostalCode('13001')).toBe('13');
  });

  it('keeps the three-digit overseas prefix', () => {
    expect(departmentFromPostalCode('97400')).toBe('974');
    expect(departmentFromPostalCode('97110')).toBe('971');
  });

  it('resolves Corsican departments', () => {
    expect(departmentFromPostalCode('20000')).toBe('2A');
    expect(departmentFromPostalCode('20190')).toBe('2A');
    expect(departmentFromPostalCode('20200')).toBe('2B');
    expect(departmentFromPostalCode('20600')).toBe('2B');
  });

  it('returns nothing for an absent or malformed code', () => {
    expect(departmentFromPostalCode(undefined)).toBeUndefined();
    expect(departmentFromPostalCode('')).toBeUndefined();
    expect(departmentFromPostalCode('750')).toBeUndefined();
    expect(departmentFromPostalCode('ABCDE')).toBeUndefined();
  });
});
