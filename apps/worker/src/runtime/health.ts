import { checkPostgresHealth } from '@actionpop/core';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

const READINESS_TIMEOUT_MS = 2_000;

/**
 * Readiness means Redis answers a ping and Postgres answers a trivial query. The
 * timeout bounds a probe that hangs; a slow dependency must not hold the HTTP request
 * open until the orchestrator gives up.
 */
export function createReadiness(redis: Redis, postgres: PrismaClient): () => Promise<boolean> {
  return () =>
    new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), READINESS_TIMEOUT_MS);
      Promise.all([redis.ping(), checkPostgresHealth(postgres)])
        .then(([result]) => resolve(result === 'PONG'))
        .catch(() => resolve(false))
        .finally(() => clearTimeout(timeout));
    });
}
