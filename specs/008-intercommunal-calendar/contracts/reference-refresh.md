# Contract: EPCI Reference Refresh

## Input

An official source export containing EPCI identity/category/status records and municipality
membership records. The adapter must map source fields to the data model without exposing
source-specific fields to the public search contract.

## Validation

The refresh must reject or quarantine a snapshot when:

- an EPCI ID, name, or supported category is missing;
- a membership points to an unknown commune;
- an EPCI has duplicate membership rows;
- a date interval is invalid;
- a category is outside `CC`, `CA`, `CU`, `METRO`;
- a supposedly complete source export has unexplained missing membership records.

Diagnostics must include counts, identifiers where safe, and the source version.

## Activation

1. Download and parse the source through an isolated adapter.
2. Load a `staged` version.
3. Validate referential integrity and completeness.
4. Publish diagnostics.
5. Atomically activate only a valid version.
6. Retire the previous version after the new version is active.

If any step before activation fails, the previous active version remains served. The worker
must expose refresh counts and failure diagnostics through the existing operational reporting.
