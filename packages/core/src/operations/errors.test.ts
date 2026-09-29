import { describe, expect, it } from 'vitest';

import { ConfigurationError, HttpError, PayloadValidationError } from './errors.js';
import { classifyRetry } from './retry-policy.js';

describe('errors and retry policy', () => {
  it('retries transient HTTP failures but not malformed payloads', () => {
    expect(classifyRetry(new HttpError(503)).retryable).toBe(true);
    expect(classifyRetry(new HttpError(401)).retryable).toBe(false);
    expect(classifyRetry(new PayloadValidationError('invalid')).retryable).toBe(false);
    expect(classifyRetry(new ConfigurationError('invalid')).retryable).toBe(false);
  });
});