import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type PackageManifest = {
  name?: string;
  dependencies?: Record<string, string>;
};

describe('workspace installation contract', () => {
  it('discovers all workspace packages and uses workspace dependencies', async () => {
    const root = resolve(import.meta.dirname, '../..');
    const workspace = await readFile(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
    const manifests = await Promise.all([
      readManifest(resolve(root, 'packages/core/package.json')),
      readManifest(resolve(root, 'apps/api/package.json')),
      readManifest(resolve(root, 'apps/worker/package.json')),
    ]);

    expect(workspace).toContain('packages/*');
    expect(workspace).toContain('apps/*');
    expect(manifests.map(manifest => manifest.name)).toEqual([
      '@actionpop/core',
      '@actionpop/api',
      '@actionpop/worker',
    ]);
    expect(manifests[1]?.dependencies?.['@actionpop/core']).toMatch(/^workspace:/);
    expect(manifests[2]?.dependencies?.['@actionpop/core']).toMatch(/^workspace:/);
  });
});

async function readManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, 'utf8')) as PackageManifest;
}
