import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let loaded = false;

function findWorkspaceRoot(start: string): string | undefined {
  let current = start;
  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * Loads repository environment files for local execution.
 *
 * `.env` provides shared defaults and never overrides real environment
 * variables. `.env.local` is optional and overrides both `.env` and the
 * prepared environment, which lets local development point at loopback
 * services without editing the shared file. The workspace root is resolved
 * so the same files are found whatever package directory the process runs
 * from.
 */
export function loadEnvFile(directory = findWorkspaceRoot(process.cwd()) ?? process.cwd()): void {
  if (loaded) return;
  loaded = true;
  config({ path: resolve(directory, '.env'), override: false, quiet: true });
  config({ path: resolve(directory, '.env.local'), override: true, quiet: true });
}
