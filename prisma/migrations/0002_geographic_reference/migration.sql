-- AlterTable
ALTER TABLE "event_record" ADD COLUMN     "commune_id" TEXT,
ADD COLUMN     "country_code" TEXT,
ADD COLUMN     "department_code" TEXT,
ADD COLUMN     "department_source" TEXT,
ADD COLUMN     "geographic_diagnostics" JSONB,
ADD COLUMN     "geographic_status" TEXT,
ADD COLUMN     "raw_commune_name" TEXT,
ADD COLUMN     "raw_department_code" TEXT,
ADD COLUMN     "reference_version" TEXT;

-- CreateTable
CREATE TABLE "geographic_reference_version" (
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'staged',
    "source" TEXT NOT NULL,
    "publication_date" TEXT NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL,
    "license" TEXT NOT NULL,
    "commune_count" INTEGER NOT NULL DEFAULT 0,
    "department_count" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL,
    "validation_errors" JSONB,

    CONSTRAINT "geographic_reference_version_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "department_reference" (
    "version_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commune_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "department_reference_pkey" PRIMARY KEY ("version_id","code")
);

-- CreateTable
CREATE TABLE "commune_reference" (
    "version_id" TEXT NOT NULL,
    "insee_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "pronoun_free_normalized_name" TEXT NOT NULL,
    "postal_codes" TEXT[],
    "department_code" TEXT NOT NULL,

    CONSTRAINT "commune_reference_pkey" PRIMARY KEY ("version_id","insee_code")
);

-- CreateIndex
CREATE INDEX "commune_reference_version_id_normalized_name_idx" ON "commune_reference"("version_id", "normalized_name");

-- CreateIndex
CREATE INDEX "commune_reference_version_id_pronoun_free_normalized_name_idx" ON "commune_reference"("version_id", "pronoun_free_normalized_name");

-- CreateIndex
CREATE INDEX "commune_reference_version_id_department_code_idx" ON "commune_reference"("version_id", "department_code");

-- CreateIndex
CREATE INDEX "commune_reference_postal_codes_idx" ON "commune_reference" USING GIN ("postal_codes");

-- CreateIndex
CREATE INDEX "event_record_country_code_idx" ON "event_record"("country_code");

-- CreateIndex
CREATE INDEX "event_record_department_code_idx" ON "event_record"("department_code");

-- CreateIndex
CREATE INDEX "event_record_commune_id_idx" ON "event_record"("commune_id");

-- CreateIndex
CREATE INDEX "event_record_reference_version_idx" ON "event_record"("reference_version");

-- AddForeignKey
ALTER TABLE "department_reference" ADD CONSTRAINT "department_reference_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "geographic_reference_version"("version") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commune_reference" ADD CONSTRAINT "commune_reference_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "geographic_reference_version"("version") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commune_reference" ADD CONSTRAINT "commune_reference_version_id_department_code_fkey" FOREIGN KEY ("version_id", "department_code") REFERENCES "department_reference"("version_id", "code") ON DELETE CASCADE ON UPDATE CASCADE;


-- Enforce a single active reference version (not expressible in Prisma's schema language).
CREATE UNIQUE INDEX "geographic_reference_version_one_active"
  ON "geographic_reference_version" ("status")
  WHERE "status" = 'active';
