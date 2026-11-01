import { describe, expect, it } from 'vitest';

import { decodeSubject, encodeSubject } from '../../src/features/discovery/utils/query-encoding';

describe('subject encoding', () => {
  it('round-trips a kind and an identifier', () => {
    expect(encodeSubject({ kind: 'commune', id: '01001' })).toBe('commune:01001');
    expect(decodeSubject('commune:01001')).toEqual({ kind: 'commune', id: '01001' });
  });

  it('rejects an identifier containing a separator or an empty part', () => {
    expect(decodeSubject('commune:a:b')).toBeNull();
    expect(decodeSubject('commune:')).toBeNull();
    expect(decodeSubject(':69123')).toBeNull();
    expect(decodeSubject(null)).toBeNull();
  });
});
