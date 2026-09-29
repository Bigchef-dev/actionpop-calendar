import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('typecheck gate', () => {
  it('reports an invalid public type through tsc -b', async () => {
    const root = resolve(import.meta.dirname, '../..');
    const fixtureDirectory = await mkdtemp(resolve(root, 'node_modules/.tmp-typecheck-'));
    const fixturePath = resolve(fixtureDirectory, 'public-api.ts');
    const configPath = resolve(fixtureDirectory, 'tsconfig.json');

    try {
      await writeFile(fixturePath, 'export const invalidPublicValue: string = 42;\n');
      await writeFile(configPath, JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        files: [fixturePath],
      }));

      await expectFailureOutput(root, configPath);
    } finally {
      await rm(dirname(fixturePath), { recursive: true, force: true });
    }
  }, 15000);
});

async function expectFailureOutput(root: string, configPath: string): Promise<void> {
  try {
    await execFileAsync('pnpm', ['exec', 'tsc', '-b', configPath, '--pretty', 'false'], { cwd: root });
    throw new Error('Expected the invalid fixture to fail type checking');
  } catch (error) {
    const output = error && typeof error === 'object'
      ? `${'stdout' in error ? error.stdout : ''}${'stderr' in error ? error.stderr : ''}`
      : '';
    expect(output).toContain('public-api.ts');
    expect(output).toMatch(/TS2322|not assignable/);
  }
}
