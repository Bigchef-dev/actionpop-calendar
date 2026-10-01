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
    expect(apiDockerfile).toContain('pnpm --filter @actionpop/api deploy --prod /tmp/api');
    expect(workerDockerfile).toContain('pnpm --filter @actionpop/worker deploy --prod /tmp/worker');
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
});
