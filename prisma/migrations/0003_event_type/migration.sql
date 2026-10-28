-- AlterTable
ALTER TABLE "event_record" ADD COLUMN     "event_type" TEXT;

-- CreateTable
CREATE TABLE "event_type_reference" (
    "value" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "event_type_reference_pkey" PRIMARY KEY ("value")
);

-- CreateIndex
CREATE INDEX "event_record_event_type_idx" ON "event_record"("event_type");

