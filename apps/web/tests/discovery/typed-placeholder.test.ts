import { describe, expect, it } from 'vitest';

import { PLACEHOLDER_TIMING } from '../../src/config';
import {
  buildPlaceholderScript,
  isStaticPlaceholder,
} from '../../src/features/discovery/utils/typed-placeholder';

describe('buildPlaceholderScript', () => {
  it('types and erases at least the minimum number of examples before repeating', () => {
    const frames = buildPlaceholderScript(['Lyon', '69'], PLACEHOLDER_TIMING);
    const typed = frames.filter((frame) => frame.text === 'Lyon' || frame.text === '69');
    expect(typed.length).toBeGreaterThanOrEqual(PLACEHOLDER_TIMING.minExamples);
    expect(frames.some((frame) => frame.text === '')).toBe(true);
  });

  it('ends each example with an erase frame', () => {
    const timing = { ...PLACEHOLDER_TIMING, minExamples: 2 };
    const frames = buildPlaceholderScript(['Rennes'], timing);
    const eraseFrames = frames.filter(
      (frame) => frame.text === '' && frame.delayMs === timing.eraseMs,
    );
    expect(eraseFrames).toHaveLength(2);
  });

  it('ignores empty examples and returns nothing when none remain', () => {
    expect(buildPlaceholderScript(['  ', ''], PLACEHOLDER_TIMING)).toEqual([]);
  });
});

describe('isStaticPlaceholder', () => {
  it('stops on focus, after input, and under reduced motion', () => {
    expect(
      isStaticPlaceholder({ prefersReducedMotion: false, focused: false, hasInput: false }),
    ).toBe(false);
    expect(
      isStaticPlaceholder({ prefersReducedMotion: false, focused: true, hasInput: false }),
    ).toBe(true);
    expect(
      isStaticPlaceholder({ prefersReducedMotion: false, focused: false, hasInput: true }),
    ).toBe(true);
    expect(
      isStaticPlaceholder({ prefersReducedMotion: true, focused: false, hasInput: false }),
    ).toBe(true);
  });
});
