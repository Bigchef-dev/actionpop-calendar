import { describe, expect, it } from 'vitest';

import {
  ACTION_TYPES,
  NEUTRAL_EMOJI,
  actionTypeFor,
} from '../../src/features/calendar/data/event-types';

describe('action type catalogue', () => {
  it('loads the shipped catalogue keyed by the published slug', () => {
    expect(ACTION_TYPES.length).toBeGreaterThan(10);
    expect(
      ACTION_TYPES.some((type) => type.slug === 'tractage' || type.slug === 'diffusion-tracts'),
    ).toBe(true);
  });

  it('returns the catalogue emoji and label for a known slug', () => {
    const known = ACTION_TYPES[0];
    expect(known).toBeDefined();
    if (known === undefined) return;
    const resolved = actionTypeFor(known.slug);
    expect(resolved.emoji).toBe(known.emoji);
    expect(resolved.label).toBe(known.label);
  });

  it('falls back to a neutral emoji and a readable label for an unknown slug', () => {
    const resolved = actionTypeFor('nouvelle-pratique');
    expect(resolved.emoji).toBe(NEUTRAL_EMOJI);
    expect(resolved.label).toBe('Nouvelle pratique');
  });

  it('falls back to a neutral presentation when no type is published', () => {
    expect(actionTypeFor(null).emoji).toBe(NEUTRAL_EMOJI);
  });
});
