import { describe, expect, it } from 'vitest';

import { retryDelayMs, shouldRetry } from '../src/queue/queue.js';
import { NetworkError, PayloadValidationError } from '@actionpop/core';

describe('retry and redelivery policy', () => {
  it('backs off exponentially and retries transient failures only', () => {
    expect(retryDelayMs(1, 1000, 0)).toBe(1000);
    expect(retryDelayMs(3, 1000, 0)).toBe(4000);
    expect(shouldRetry(new NetworkError('down'))).toBe(true);
    expect(shouldRetry(new PayloadValidationError('bad payload'))).toBe(false);
  });
});