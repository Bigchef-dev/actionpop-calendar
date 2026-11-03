import { PLACEHOLDER_TIMING } from '../../../config';

export interface PlaceholderTiming {
  readonly typeMs: number;
  readonly holdMs: number;
  readonly eraseMs: number;
  readonly betweenMs: number;
  readonly minExamples: number;
}

export interface PlaceholderFrame {
  readonly text: string;
  readonly delayMs: number;
}

/**
 * Builds the full typing/erasing cycle of the placeholder: one frame per typed character,
 * a hold frame, then an erase frame, for each example. Fewer examples than the minimum are
 * cycled so the visitor always sees at least `minExamples` of them before the cycle repeats.
 */
export function buildPlaceholderScript(
  examples: readonly string[],
  timing: PlaceholderTiming = PLACEHOLDER_TIMING,
): PlaceholderFrame[] {
  const usable = examples.map((example) => example.trim()).filter((example) => example !== '');
  if (usable.length === 0) return [];

  const cycle: string[] = [];
  while (cycle.length < Math.max(timing.minExamples, 1)) {
    cycle.push(...usable);
  }

  const frames: PlaceholderFrame[] = [];
  for (const example of cycle) {
    for (let index = 1; index <= example.length; index += 1) {
      frames.push({ text: example.slice(0, index), delayMs: timing.typeMs });
    }
    frames.push({ text: example, delayMs: timing.holdMs });
    frames.push({ text: '', delayMs: timing.eraseMs });
    frames.push({ text: '', delayMs: timing.betweenMs });
  }
  return frames;
}

/** The animation must stop on focus, after any typed input, and under reduced motion. */
export function isStaticPlaceholder(state: {
  readonly prefersReducedMotion: boolean;
  readonly focused: boolean;
  readonly hasInput: boolean;
}): boolean {
  return state.prefersReducedMotion || state.focused || state.hasInput;
}
