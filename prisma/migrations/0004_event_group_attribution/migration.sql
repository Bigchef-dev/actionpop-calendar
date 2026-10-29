-- Event attribution marker: stated, none_stated, or unknown for rows written before this feature.
ALTER TABLE "event_record" ADD COLUMN "group_attribution" TEXT NOT NULL DEFAULT 'unknown';

-- Group lifecycle: replace the overloaded `active` boolean with an explicit map status
-- (what the directory says) and retrieval status (what the scheduler may do).
ALTER TABLE "group_scope"
  ADD COLUMN "scope_key" TEXT,
  ADD COLUMN "discovery_source" TEXT NOT NULL DEFAULT 'directory',
  ADD COLUMN "map_status" TEXT NOT NULL DEFAULT 'unlisted',
  ADD COLUMN "retrieval_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "first_observed_at" TIMESTAMP(3),
  ADD COLUMN "last_observed_at" TIMESTAMP(3),
  ADD COLUMN "stopped_at" TIMESTAMP(3),
  ADD COLUMN "stopped_reason" TEXT;

-- Identity is case-insensitive: the dispatcher already lowercases scope identifiers in
-- job IDs, so two spellings of one identifier must not become two retrievable scopes.
UPDATE "group_scope" SET "scope_key" = lower(btrim("scope_id"));

UPDATE "group_scope" SET
  "map_status" = CASE WHEN "active" THEN 'listed' ELSE 'inactive' END,
  "retrieval_status" = CASE WHEN "active" THEN 'active' ELSE 'stopped_inactive' END;

ALTER TABLE "group_scope" ALTER COLUMN "scope_key" SET NOT NULL;
ALTER TABLE "group_scope" DROP COLUMN "active";

-- Attribution provenance: the listing whose observation stated the link. Existing links
-- keep their current meaning by observing themselves, which reproduces today's behaviour
-- until the next complete observation rewrites them.
ALTER TABLE "event_group_link" ADD COLUMN "observed_via_scope_id" TEXT;
UPDATE "event_group_link" SET "observed_via_scope_id" = "scope_id";
ALTER TABLE "event_group_link" ALTER COLUMN "observed_via_scope_id" SET NOT NULL;
ALTER TABLE "event_group_link" DROP CONSTRAINT "event_group_link_pkey";
ALTER TABLE "event_group_link" ADD CONSTRAINT "event_group_link_pkey" PRIMARY KEY ("event_id", "scope_id", "observed_via_scope_id");

-- CreateTable
CREATE TABLE "event_observation" (
    "event_id" TEXT NOT NULL,
    "via_scope_id" TEXT NOT NULL,
    "stated_group_count" INTEGER NOT NULL,
    "first_seen_period" TEXT NOT NULL,
    "last_seen_period" TEXT NOT NULL,

    CONSTRAINT "event_observation_pkey" PRIMARY KEY ("event_id","via_scope_id")
);

-- CreateTable
CREATE TABLE "ingestion_cycle_metric" (
    "period_token" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ingestion_cycle_metric_pkey" PRIMARY KEY ("period_token","metric")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_scope_scope_key_key" ON "group_scope"("scope_key");

-- CreateIndex
CREATE INDEX "group_scope_retrieval_status_idx" ON "group_scope"("retrieval_status");

-- CreateIndex
CREATE INDEX "group_scope_map_status_idx" ON "group_scope"("map_status");

-- CreateIndex
CREATE INDEX "group_scope_first_observed_at_idx" ON "group_scope"("first_observed_at");

-- CreateIndex
CREATE INDEX "event_record_group_attribution_idx" ON "event_record"("group_attribution");

-- CreateIndex
CREATE INDEX "event_group_link_scope_id_idx" ON "event_group_link"("scope_id");

-- CreateIndex
CREATE INDEX "event_observation_last_seen_period_idx" ON "event_observation"("last_seen_period");

-- AddForeignKey
ALTER TABLE "event_group_link" ADD CONSTRAINT "event_group_link_observed_via_scope_id_fkey" FOREIGN KEY ("observed_via_scope_id") REFERENCES "group_scope"("scope_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_observation" ADD CONSTRAINT "event_observation_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event_record"("source_event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_observation" ADD CONSTRAINT "event_observation_via_scope_id_fkey" FOREIGN KEY ("via_scope_id") REFERENCES "group_scope"("scope_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_cycle_metric" ADD CONSTRAINT "ingestion_cycle_metric_period_token_fkey" FOREIGN KEY ("period_token") REFERENCES "processing_period"("period_token") ON DELETE CASCADE ON UPDATE CASCADE;
