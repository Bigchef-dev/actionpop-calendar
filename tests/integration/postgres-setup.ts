import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

import {
  createPostgresClient,
  closePostgres,
} from '../../packages/core/src/infrastructure/postgres.js';

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

export function withSchema(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
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
    const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
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
      const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
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
