import { describe, expect, it } from 'vitest';

import { serviceName } from '../src/index.js';

describe('worker package smoke test', () => {
  it('runs through the package test command', () => {
    expect(serviceName).toBe('@actionpop/worker');
  });
});
