-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "group_scope" (
    "scope_id" TEXT NOT NULL,
    "display_name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scope_type" TEXT,
    "source_subtype" INTEGER,
    "certified" BOOLEAN,
    "source_link" TEXT,
    "source_filter" TEXT,
    "location_id" TEXT,

    CONSTRAINT "group_scope_pkey" PRIMARY KEY ("scope_id")
);

-- CreateTable
CREATE TABLE "location_record" (
    "location_id" TEXT NOT NULL,
    "owner_type" TEXT,
    "name" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "full_address" TEXT,
    "short_address" TEXT,
    "static_map_url" TEXT,

    CONSTRAINT "location_record_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "geo_point" (
    "location_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Point',
    "longitude" DECIMAL(10,7) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,

    CONSTRAINT "geo_point_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "event_record" (
    "source_event_id" TEXT NOT NULL,
    "content_hash" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "source_url" TEXT,
    "location_id" TEXT,
    "last_seen_period" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_record_pkey" PRIMARY KEY ("source_event_id")
);

-- CreateTable
CREATE TABLE "event_group_link" (
    "event_id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,

    CONSTRAINT "event_group_link_pkey" PRIMARY KEY ("event_id","scope_id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "event_id" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_period" (
    "period_token" TEXT NOT NULL,
    "period_start_utc" TIMESTAMP(3) NOT NULL,
    "period_end_utc" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_period_pkey" PRIMARY KEY ("period_token")
);

-- CreateTable
CREATE TABLE "ingestion_ledger" (
    "job_id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "period_token" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "worker_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_ledger_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "calendar_snapshot" (
    "snapshot_id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "event_ids" JSONB NOT NULL,

    CONSTRAINT "calendar_snapshot_pkey" PRIMARY KEY ("snapshot_id")
);

-- CreateIndex
CREATE INDEX "subscription_scope_id_idx" ON "subscription"("scope_id");

-- CreateIndex
CREATE INDEX "subscription_event_id_idx" ON "subscription"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_ledger_scope_id_period_token_key" ON "ingestion_ledger"("scope_id", "period_token");

-- CreateIndex
CREATE INDEX "calendar_snapshot_scope_id_status_revision_idx" ON "calendar_snapshot"("scope_id", "status", "revision");

-- AddForeignKey
ALTER TABLE "group_scope" ADD CONSTRAINT "group_scope_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location_record"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_point" ADD CONSTRAINT "geo_point_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location_record"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_record" ADD CONSTRAINT "event_record_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location_record"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_record" ADD CONSTRAINT "event_record_last_seen_period_fkey" FOREIGN KEY ("last_seen_period") REFERENCES "processing_period"("period_token") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_group_link" ADD CONSTRAINT "event_group_link_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event_record"("source_event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_group_link" ADD CONSTRAINT "event_group_link_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "group_scope"("scope_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "group_scope"("scope_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event_record"("source_event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_ledger" ADD CONSTRAINT "ingestion_ledger_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "group_scope"("scope_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_ledger" ADD CONSTRAINT "ingestion_ledger_period_token_fkey" FOREIGN KEY ("period_token") REFERENCES "processing_period"("period_token") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_snapshot" ADD CONSTRAINT "calendar_snapshot_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "group_scope"("scope_id") ON DELETE CASCADE ON UPDATE CASCADE;

