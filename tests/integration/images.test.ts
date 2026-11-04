import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const apiDockerfile = readFileSync('infra/docker/Dockerfile.api', 'utf8');
const integrationWorkflow = readFileSync('.github/workflows/integration.yml', 'utf8');
const workerDockerfile = readFileSync('infra/docker/Dockerfile.worker', 'utf8');
const compose = readFileSync('infra/compose/docker-compose.yml', 'utf8');
const rootPackage = JSON.parse(readFileSync('package.json', 'utf8')) as {
  engines?: { node?: string };
};
const nodeMajor = /^>=\s*(\d+)/.exec(rootPackage.engines?.node ?? '')?.[1];

describe('runtime image contracts', () => {
  it('defines independent non-root API and worker targets', () => {
    expect(nodeMajor).toBeDefined();
    expect(apiDockerfile).toContain(`FROM node:${nodeMajor}-alpine AS runtime`);
    expect(workerDockerfile).toContain(`FROM node:${nodeMajor}-alpine AS runtime`);
    expect(apiDockerfile).toContain('USER actionpop');
    expect(workerDockerfile).toContain('USER actionpop');
    expect(apiDockerfile).toContain('CMD ["node", "apps/api/dist/main.js"]');
    expect(workerDockerfile).toContain('CMD ["node", "apps/worker/dist/main.js"]');
  });

  it('runs the same Node major in every build and runtime stage', () => {
    // The images must match `engines.node`: a drifting stage deploys a runtime the project
    // never tested, which is how an old Node base image once survived a runtime upgrade.
    for (const dockerfile of [apiDockerfile, workerDockerfile]) {
      const stages = [...dockerfile.matchAll(/^FROM node:(\S+)/gm)].map((match) => match[1]);
      expect(stages.length).toBeGreaterThan(0);
      for (const tag of stages) {
        expect(tag).toBe(`${nodeMajor}-alpine`);
      }
    }
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

  it('runs the same datastore versions in CI as in Compose', () => {
    // A CI job on an older Redis than production is not a smaller test, it is a different one:
    // this repository shipped a Redis 7 job against an 8.x data directory, and the difference only
    // surfaced as a container that refused to start.
    // Comments are allowed between the service name and the image, since both files explain the
    // pin in place; only the tag itself has to match.
    const tagOf = (source: string, service: string): string | undefined =>
      new RegExp(`${service}:\\n(?:\\s*#.*\\n)*\\s+image: (\\S+)`).exec(source)?.[1];

    for (const service of ['postgres', 'redis']) {
      const declared = tagOf(compose, service);
      const inCi = tagOf(integrationWorkflow, service);

      expect(declared, service).toBeDefined();
      expect(inCi, service).toBe(declared);
    }
  });

  it('mounts the PostgreSQL volume where the current major keeps its data', () => {
    // PostgreSQL 18 refuses to start when the volume is mounted at `/var/lib/postgresql/data`:
    // PGDATA lives in a versioned subdirectory, so the mount belongs one level up.
    const major = /image: postgres:(\d+)/.exec(compose)?.[1];

    expect(major).toBeDefined();
    if (Number(major) >= 18) {
      expect(compose).toContain('postgres-data:/var/lib/postgresql\n');
      expect(compose).not.toContain('postgres-data:/var/lib/postgresql/data');
    }
  });

  it('applies migrations before the applications start', () => {
    expect(compose).toContain('migrate:');
    expect(compose).toContain("'node_modules/.bin/prisma', 'migrate', 'deploy'");
    expect(compose).toContain('condition: service_completed_successfully');
  });
});
