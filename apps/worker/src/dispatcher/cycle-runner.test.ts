import { describe, expect, it } from 'vitest';

import { createCycleRunner } from './cycle-runner.js';

function recordingLogger() {
  const warnings: string[] = [];
  const errors: string[] = [];
  return {
    warnings,
    errors,
    logger: {
      warn: (message: string) => {
        warnings.push(message);
      },
      error: (message: string) => {
        errors.push(message);
      },
    },
  };
}

describe('dispatcher cycle runner', () => {
  it('absorbs a cycle failure so the process keeps running', async () => {
    const { logger, errors } = recordingLogger();
    const run = createCycleRunner(async () => {
      throw new Error('database is unavailable');
    }, logger);

    await expect(run()).resolves.toBeUndefined();
    expect(errors).toEqual(['dispatcher cycle failed']);
  });

  it('skips an invocation while the previous cycle is still running', async () => {
    const { logger, warnings } = recordingLogger();
    let release: (() => void) | undefined;
    let calls = 0;
    const run = createCycleRunner(async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
    }, logger);

    const first = run();
    await run();
    expect(calls).toBe(1);
    expect(warnings).toEqual(['dispatcher cycle skipped']);

    release?.();
    await first;
    await run();
    expect(calls).toBe(2);
  });
});
