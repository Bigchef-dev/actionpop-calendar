import { describe, expect, it } from 'vitest';

import { serviceName } from '../src/index.js';

describe('api package smoke test', () => {
  it('runs through the package test command', () => {
    expect(serviceName).toBe('@actionpop/api');
  });
});
