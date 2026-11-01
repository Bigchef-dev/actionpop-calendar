import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

import {
  closePostgres,
  createDriverAdapter,
  createPostgresClient,
} from '../../packages/core/src/infrastructure/postgres.js';

/** Prisma 7 connects through a driver adapter, so a bare client needs one too. */
function adminClient(url: string): PrismaClient {
  return new PrismaClient({ adapter: createDriverAdapter(url) });
}

export function resolveTestDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.TEST_DATABASE_URL ?? env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL or DATABASE_URL must be defined for PostgreSQL integration tests',
    );
  }
  return url;
}

/**
 * Each integration file runs in its own schema. The pool is capped well below the pg
 * default because every file owns a client and vitest runs them in parallel: 21 files
 * with the default of ten connections would exceed Postgres `max_connections`.
 */
const TEST_CONNECTION_LIMIT = 3;

export function withSchema(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  url.searchParams.set('connection_limit', String(TEST_CONNECTION_LIMIT));
  return url.toString();
}

export function applyMigrations(databaseUrl: string): void {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(process.cwd()),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed: ${result.stderr || result.stdout}`);
  }
}

export interface IntegrationPostgres {
  prisma: PrismaClient;
  databaseUrl: string;
  stop: () => Promise<void>;
}

/**
 * Each integration file gets its own schema so parallel test files cannot activate or
 * truncate each other's reference versions.
 */
export async function startIntegrationPostgres(
  options: { schema?: string } = {},
): Promise<IntegrationPostgres> {
  const baseUrl = resolveTestDatabaseUrl();
  const schema = options.schema;

  if (schema !== undefined) {
    const admin = adminClient(baseUrl);
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    } finally {
      await admin.$disconnect();
    }
  }

  const databaseUrl = schema === undefined ? baseUrl : withSchema(baseUrl, schema);
  applyMigrations(databaseUrl);

  const prisma = createPostgresClient(databaseUrl);
  return {
    prisma,
    databaseUrl,
    stop: async () => {
      await closePostgres(prisma);
      if (schema === undefined) return;
      const admin = adminClient(baseUrl);
      try {
        await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.$disconnect();
      }
    },
  };
}

const GEOGRAPHIC_TABLES = [
  'commune_reference',
  'department_reference',
  'geographic_reference_version',
];

export async function truncateGeographicReference(prisma: {
  $executeRawUnsafe: (query: string) => Promise<number>;
}): Promise<void> {
  const tables = GEOGRAPHIC_TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
}
