import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const apiDockerfile = readFileSync('infra/docker/Dockerfile.api', 'utf8');
const workerDockerfile = readFileSync('infra/docker/Dockerfile.worker', 'utf8');
const compose = readFileSync('infra/compose/docker-compose.yml', 'utf8');

describe('runtime image contracts', () => {
  it('defines independent non-root API and worker targets', () => {
    expect(apiDockerfile).toContain('FROM node:20-alpine AS runtime');
    expect(workerDockerfile).toContain('FROM node:20-alpine AS runtime');
    expect(apiDockerfile).toContain('USER actionpop');
    expect(workerDockerfile).toContain('USER actionpop');
    expect(apiDockerfile).toContain('CMD ["node", "apps/api/dist/main.js"]');
    expect(workerDockerfile).toContain('CMD ["node", "apps/worker/dist/main.js"]');
  });

  it('generates the Prisma client from the schema before compiling', () => {
    for (const dockerfile of [apiDockerfile, workerDockerfile]) {
      // Without the schema the build fails on `Prisma.sql`, and without the generated
      // client the runtime answers with an undefined model delegate.
      expect(dockerfile).toContain('COPY prisma prisma');
      expect(dockerfile).toMatch(/prisma generate --schema=prisma\/schema\.prisma/);
    }
  });

  it('ships the built workspace the runtime resolves @actionpop/core from', () => {
    for (const dockerfile of [apiDockerfile, workerDockerfile]) {
      // `pnpm deploy` installs its own @prisma/client stub and leaves the workspace link
      // broken, so the image must not rely on it.
      expect(dockerfile).not.toMatch(/pnpm --filter @actionpop\/\w+ deploy/);
      expect(dockerfile).toContain('COPY --from=build');
      expect(dockerfile).toContain('/app /app');
    }
  });

  it('keeps application services dependent on private Redis', () => {
    expect(compose).toContain('API_IMAGE');
    expect(compose).toContain('WORKER_IMAGE');
    expect(compose).toContain('internal: true');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('dockerfile: infra/docker/Dockerfile.api');
    expect(compose).toContain('dockerfile: infra/docker/Dockerfile.worker');
    expect(compose).toContain('context: ../..');
  });

  it('applies migrations before the applications start', () => {
    expect(compose).toContain('migrate:');
    expect(compose).toContain("'node_modules/.bin/prisma', 'migrate', 'deploy'");
    expect(compose).toContain('condition: service_completed_successfully');
  });
});
