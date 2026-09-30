import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync('infra/docker/Dockerfile', 'utf8');
const compose = readFileSync('infra/compose/docker-compose.yml', 'utf8');

describe('runtime image contracts', () => {
  it('defines independent non-root API and worker targets', () => {
    expect(dockerfile).toContain('FROM runtime-base AS api');
    expect(dockerfile).toContain('FROM runtime-base AS worker');
    expect(dockerfile).toContain('USER actionpop');
    expect(dockerfile).toContain('pnpm install --prod --frozen-lockfile');
  });

  it('keeps application services dependent on private Redis', () => {
    expect(compose).toContain('API_IMAGE');
    expect(compose).toContain('WORKER_IMAGE');
    expect(compose).toContain('internal: true');
    expect(compose).toContain('condition: service_healthy');
  });
});
