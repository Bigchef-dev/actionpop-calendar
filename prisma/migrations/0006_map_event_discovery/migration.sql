CREATE TABLE "map_event_observation" (
  "event_id" TEXT NOT NULL,
  "summary_fingerprint" TEXT NOT NULL,
  "display_name" TEXT,
  "start_time" TIMESTAMPTZ(3),
  "end_time" TIMESTAMPTZ(3),
  "subtype_id" INTEGER,
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_requested_at" TIMESTAMPTZ(3),
  "last_outcome" TEXT,
  "next_reconcile_at" TIMESTAMPTZ(3),
  CONSTRAINT "map_event_observation_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "map_event_observation_next_reconcile_at_idx"
  ON "map_event_observation" ("next_reconcile_at");
