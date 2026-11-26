import { Prisma } from '@prisma/client';

import type { ScopeKind } from '../scopes/scope-kind.js';
import type { RegistryClient } from './postgres-group-registry.js';

/** Scopes whose "visited" state can be reset; the map singleton has its own handling. */
export type VisitedScopeKind = Extract<ScopeKind, 'group' | 'event'>;

function kindList(kinds: readonly ScopeKind[]): Prisma.Sql {
  return Prisma.join(kinds.map((kind) => Prisma.sql`${kind}::text`));
}

/** Active scopes are the ones already visited; stopped and retired states are preserved. */
export async function countVisitedScopes(
  client: RegistryClient,
  kinds: readonly VisitedScopeKind[],
): Promise<number> {
  if (kinds.length === 0) return 0;
  const rows = await client.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*) AS count FROM "ingestion_scope"
    WHERE "scope_kind" IN (${kindList(kinds)}) AND "retrieval_status" = 'active'
  `);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Moves active scopes back to `pending` so the dispatcher promotes them again through
 * its existing per-period budget. `stopped_inactive`, `stopped_unknown`,
 * `stopped_disabled` and `retired` are deliberate states and stay untouched.
 */
export async function resetVisitedScopesToPending(
  client: RegistryClient,
  kinds: readonly VisitedScopeKind[],
): Promise<number> {
  if (kinds.length === 0) return 0;
  return client.$executeRaw(Prisma.sql`
    UPDATE "ingestion_scope"
    SET "retrieval_status" = 'pending', "stopped_at" = NULL, "stopped_reason" = NULL
    WHERE "scope_kind" IN (${kindList(kinds)}) AND "retrieval_status" = 'active'
  `);
}

async function ledgerRows(
  client: RegistryClient,
  periodToken: string,
  kinds: readonly ScopeKind[],
): Promise<{ job_id: string }[]> {
  if (kinds.length === 0) return [];
  return client.$queryRaw<{ job_id: string }[]>(Prisma.sql`
    SELECT ledger."job_id"
    FROM "ingestion_ledger" AS ledger
    JOIN "ingestion_scope" AS scope ON scope."scope_id" = ledger."scope_id"
    WHERE ledger."period_token" = ${periodToken}::text
      AND scope."scope_kind" IN (${kindList(kinds)})
  `);
}

/** How many ledger rows a reset would remove for the current period. */
export async function countLedgerRowsForPeriod(
  client: RegistryClient,
  periodToken: string,
  kinds: readonly ScopeKind[],
): Promise<number> {
  return (await ledgerRows(client, periodToken, kinds)).length;
}

/**
 * Removes the period's ledger rows, which is what lets the dispatcher reschedule the
 * same scope in the same period. Returns the removed job identifiers so the caller can
 * also clear the corresponding BullMQ jobs.
 */
export async function deleteLedgerRowsForPeriod(
  client: RegistryClient,
  periodToken: string,
  kinds: readonly ScopeKind[],
): Promise<readonly string[]> {
  const rows = await ledgerRows(client, periodToken, kinds);
  if (rows.length === 0) return [];
  await client.$executeRaw(Prisma.sql`
    DELETE FROM "ingestion_ledger"
    WHERE "job_id" IN (${Prisma.join(rows.map((row) => Prisma.sql`${row.job_id}::text`))})
  `);
  return rows.map((row) => row.job_id);
}

/** Observations still carrying a request state, which a full map refresh must clear. */
export async function countMapObservationRequests(client: RegistryClient): Promise<number> {
  const rows = await client.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*) AS count FROM "map_event_observation"
    WHERE "last_requested_at" IS NOT NULL
       OR "last_outcome" IS NOT NULL
       OR "next_reconcile_at" IS NOT NULL
  `);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Forgets every request already made from the map listing. The listing itself is kept:
 * the next cycle re-evaluates freshness and re-requests what is no longer covered.
 */
export async function resetMapObservationRequests(client: RegistryClient): Promise<number> {
  return client.$executeRaw(Prisma.sql`
    UPDATE "map_event_observation"
    SET "last_requested_at" = NULL, "last_outcome" = NULL, "next_reconcile_at" = NULL
    WHERE "last_requested_at" IS NOT NULL
       OR "last_outcome" IS NOT NULL
       OR "next_reconcile_at" IS NOT NULL
  `);
}
