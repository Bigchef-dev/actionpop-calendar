-- Two ingestion kinds share one registry: `group` (a group listing) and `event`
-- (the detail resource of one event). The table is renamed so the name matches what
-- it now holds; foreign keys follow the rename automatically.
ALTER TABLE "group_scope" RENAME TO "ingestion_scope";

ALTER INDEX "group_scope_scope_key_key" RENAME TO "ingestion_scope_scope_key_legacy_idx";
ALTER INDEX "group_scope_retrieval_status_idx" RENAME TO "ingestion_scope_retrieval_status_idx";
ALTER INDEX "group_scope_map_status_idx" RENAME TO "ingestion_scope_map_status_idx";
ALTER INDEX "group_scope_first_observed_at_idx" RENAME TO "ingestion_scope_first_observed_at_idx";

-- Identity becomes (kind, key): group identifiers and event identifiers are both UUIDs,
-- so a key alone can no longer be assumed unique across the two kinds.
ALTER TABLE "ingestion_scope"
  ADD COLUMN "scope_kind" TEXT NOT NULL DEFAULT 'group',
  ADD COLUMN "event_ends_at" TIMESTAMP(3);

-- Existing rows keep the default `scope_kind = 'group'`; their map and retrieval
-- statuses are untouched, so the previous lifecycle converges as before.
DROP INDEX "ingestion_scope_scope_key_legacy_idx";
CREATE UNIQUE INDEX "ingestion_scope_scope_kind_scope_key_key" ON "ingestion_scope"("scope_kind", "scope_key");

-- Selection, promotion and counting filter on the kind; the retirement pass reads ends_at.
CREATE INDEX "ingestion_scope_scope_kind_retrieval_status_idx" ON "ingestion_scope"("scope_kind", "retrieval_status");
CREATE INDEX "ingestion_scope_scope_kind_event_ends_at_idx" ON "ingestion_scope"("scope_kind", "event_ends_at");
