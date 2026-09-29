import { describe, expect, it } from 'vitest';

import { packageName } from '../src/index.js';

describe('core package', () => {
  it('exposes the package entry point', () => {
    expect(packageName).toBe('@actionpop/core');
  });
});