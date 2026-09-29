import { describe, expect, it } from 'vitest';

import { packageName } from '../src/index.js';

describe('core package smoke test', () => {
  it('runs through the package test command', () => {
    expect(packageName).toBe('@actionpop/core');
  });
});
