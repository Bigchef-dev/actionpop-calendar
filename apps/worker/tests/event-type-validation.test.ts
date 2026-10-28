import { describe, expect, it } from 'vitest';

import { classifyRetry } from '@actionpop/core';

import { EventTypeValidationError } from '../src/main.js';

describe('event type validation failure', () => {
  it('is classified as a non-retryable permanent failure', () => {
    const error = new EventTypeValidationError('subtype.label: "Type Invalide" is malformed');
    expect(classifyRetry(error)).toEqual({ retryable: false, reason: 'permanent' });
  });

  it('names the field and cause in the message', () => {
    const error = new EventTypeValidationError('subtype.label: "Type Invalide" is malformed');
    expect(error.message).toContain('subtype.label');
    expect(error.message).toContain('Type Invalide');
  });
});
