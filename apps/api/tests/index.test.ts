import { describe, expect, it } from 'vitest';

import { serviceName } from '../src/index.js';

describe('api package', () => {
  it('exposes the service entry point', () => {
    expect(serviceName).toBe('@actionpop/api');
  });
});