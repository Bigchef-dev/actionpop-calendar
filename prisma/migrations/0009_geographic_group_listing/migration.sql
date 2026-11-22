-- AlterTable
-- Group attachment: every column is nullable, so an existing catalogue keeps working untouched
-- and a group simply stays unattached until an enrichment run resolves its stated address.
ALTER TABLE "ingestion_scope" ADD COLUMN     "country_code" TEXT,
ADD COLUMN     "department_code" TEXT,
ADD COLUMN     "commune_id" TEXT,
ADD COLUMN     "commune_name" TEXT,
ADD COLUMN     "department_name" TEXT,
ADD COLUMN     "reference_version" TEXT,
ADD COLUMN     "geographic_status" TEXT,
ADD COLUMN     "geographic_diagnostics" JSONB,
ADD COLUMN     "enriched_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ingestion_scope_scope_kind_map_status_retrieval_status_comm_idx" ON "ingestion_scope"("scope_kind", "map_status", "retrieval_status", "commune_id");

-- CreateIndex
CREATE INDEX "ingestion_scope_scope_kind_map_status_retrieval_status_depa_idx" ON "ingestion_scope"("scope_kind", "map_status", "retrieval_status", "department_code");

-- CreateIndex
CREATE INDEX "ingestion_scope_scope_kind_map_status_retrieval_status_coun_idx" ON "ingestion_scope"("scope_kind", "map_status", "retrieval_status", "country_code");
