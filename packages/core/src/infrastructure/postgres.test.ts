import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { checkPostgresSchema, DatabaseNotReadyError, REQUIRED_TABLES } from './postgres.js';

function client(tables: readonly string[]): PrismaClient {
  return {
    ingestionScope: {},
    $queryRaw: async () => tables.map((table_name) => ({ table_name })),
  } as unknown as PrismaClient;
}

describe('checkPostgresSchema', () => {
  it('accepts a migrated database and a current client', async () => {
    await expect(checkPostgresSchema(client(REQUIRED_TABLES))).resolves.toBeUndefined();
  });

  it('reports a client generated before the ingestion scope model existed', async () => {
    const stale = {
      $queryRaw: async () => REQUIRED_TABLES.map((table_name) => ({ table_name })),
    } as unknown as PrismaClient;

    await expect(checkPostgresSchema(stale)).rejects.toThrow(/pnpm prisma:generate/);
  });

  it('reports the tables a migration has not created yet', async () => {
    const migrated = REQUIRED_TABLES.filter((table) => table !== 'ingestion_scope');

    await expect(checkPostgresSchema(client(migrated))).rejects.toThrow(
      /missing tables ingestion_scope, run `pnpm prisma:migrate`/,
    );
  });

  it('names every missing table in one failure', async () => {
    await expect(checkPostgresSchema(client([]))).rejects.toThrow(DatabaseNotReadyError);
  });
});
