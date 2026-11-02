CREATE TABLE "epci_reference" (
    "version_id" TEXT NOT NULL,
    "epci_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "department_codes" TEXT[] NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "epci_reference_pkey" PRIMARY KEY ("version_id", "epci_id"),
    CONSTRAINT "epci_reference_version_id_fkey"
      FOREIGN KEY ("version_id") REFERENCES "geographic_reference_version"("version")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "epci_membership" (
    "version_id" TEXT NOT NULL,
    "epci_id" TEXT NOT NULL,
    "commune_id" TEXT NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'complete',

    CONSTRAINT "epci_membership_pkey" PRIMARY KEY ("version_id", "epci_id", "commune_id"),
    CONSTRAINT "epci_membership_epci_fkey"
      FOREIGN KEY ("version_id", "epci_id")
      REFERENCES "epci_reference"("version_id", "epci_id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "epci_reference_version_id_normalized_name_idx"
  ON "epci_reference"("version_id", "normalized_name");
CREATE INDEX "epci_membership_version_id_commune_id_idx"
  ON "epci_membership"("version_id", "commune_id");
