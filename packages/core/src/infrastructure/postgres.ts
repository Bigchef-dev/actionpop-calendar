import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Prisma 7 connects through a driver adapter, so the connection string is handed to the
 * adapter instead of the removed `datasources` option. The pool it creates is owned by
 * the adapter and released by `$disconnect`.
 *
 * The adapter ignores the `schema` query parameter that `datasources` used to honour, so
 * it is read here and forwarded explicitly. Integration tests rely on it to isolate each
 * file in its own schema.
 */
export function createPostgresClient(url = process.env.DATABASE_URL): PrismaClient {
  if (url === undefined || url.trim() === '') {
    throw new Error('DATABASE_URL is required');
  }
  return new PrismaClient({ adapter: createDriverAdapter(url) });
}

/**
 * Builds the pg adapter from the connection string, forwarding the settings the Prisma
 * engine used to read from it: `schema` for the search path and `connection_limit` for
 * the pool size. A missing limit keeps the pg default.
 *
 * The adapter's `schema` option only qualifies generated model queries; raw `Prisma.sql`
 * statements keep unqualified table names and resolve them through `search_path`. The
 * search path is therefore also set on every pooled connection, which is what keeps
 * unqualified SQL inside the intended schema.
 */
export function createDriverAdapter(url: string): PrismaPg {
  const parameters = new URL(url).searchParams;
  const schema = parameters.get('schema') ?? undefined;
  const limit = Number(parameters.get('connection_limit'));

  const pool: { connectionString: string; max?: number; options?: string } = {
    connectionString: url,
  };
  if (Number.isSafeInteger(limit) && limit > 0) pool.max = limit;
  if (schema !== undefined) pool.options = `-c search_path=${quoteIdentifier(schema)},public`;

  return new PrismaPg(pool, schema === undefined ? {} : { schema });
}

/** A schema name is an identifier, never a value: quote it and refuse anything else. */
function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`invalid schema name: ${identifier}`);
  }
  return `"${identifier}"`;
}

export async function checkPostgresHealth(client: PrismaClient): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}

export async function closePostgres(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}

/** Tables the runtime reads or writes; a missing one means migrations were not applied. */
export const REQUIRED_TABLES: readonly string[] = [
  'ingestion_scope',
  'event_record',
  'event_group_link',
  'event_observation',
  'calendar_snapshot',
  'processing_period',
  'ingestion_cycle_metric',
  'ingestion_ledger',
  'location_record',
  'geo_point',
  'subscription',
  'geographic_reference_version',
  'commune_reference',
  'department_reference',
  'event_type_reference',
];

/** Raised when the database is reachable but the schema or the client is behind. */
export class DatabaseNotReadyError extends Error {
  public constructor(problems: readonly string[]) {
    super(`database is not ready: ${problems.join('; ')}`);
    this.name = 'DatabaseNotReadyError';
  }
}

/**
 * Fails startup when the connection works but the deployment is behind: without this
 * check an unmigrated database or a client generated from an older schema only surfaces
 * later as a raw `relation … does not exist` or an undefined model delegate.
 */
export async function checkPostgresSchema(client: PrismaClient): Promise<void> {
  const problems: string[] = [];
  // The generated client is checked first: without the delegate nothing else can run.
  // The assertion is the only way to detect a stale generation at runtime, and it stays
  // at this single boundary.
  const staleClient = (client as Partial<PrismaClient>).ingestionScope === undefined;
  if (staleClient) {
    problems.push(
      'the generated Prisma client has no IngestionScope model, run `pnpm prisma:generate`',
    );
  }

  const rows = await client.$queryRaw<{ table_name: string }[]>(Prisma.sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()
  `);
  const present = new Set(rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    problems.push(`missing tables ${missing.join(', ')}, run \`pnpm prisma:migrate\``);
  }

  if (problems.length > 0) throw new DatabaseNotReadyError(problems);
}
