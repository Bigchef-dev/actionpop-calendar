import { describe, expect, it } from 'vitest';

import {
  ConfigurationError,
  EventIdentityMismatchError,
  HttpError,
  PayloadValidationError,
  UnknownEventError,
} from './errors.js';
import { classifyRetry } from './retry-policy.js';

describe('errors and retry policy', () => {
  it('retries transient HTTP failures but not malformed payloads', () => {
    expect(classifyRetry(new HttpError(503)).retryable).toBe(true);
    expect(classifyRetry(new HttpError(401)).retryable).toBe(false);
    expect(classifyRetry(new PayloadValidationError('invalid')).retryable).toBe(false);
    expect(classifyRetry(new ConfigurationError('invalid')).retryable).toBe(false);
  });

  it('retries a mismatched event document but leaves the unknown-event answer to the processor', () => {
    expect(classifyRetry(new EventIdentityMismatchError('event-a', 'event-b'))).toEqual({
      retryable: true,
      reason: 'other',
    });
    expect(new UnknownEventError('event-a').eventId).toBe('event-a');
  });
});
