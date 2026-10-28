# Contract: Geographic Reference Refresh

## Operator action

The worker exposes an application-level refresh command; transport authentication and
operator authorization remain deployment concerns. The command accepts the configured local
commune file and provenance metadata.

```ts
interface RefreshGeographicReferenceInput {
  communesPath: string;
  source: string;
  publicationDate: string;
  license: string;
}
```

## Result

```ts
interface RefreshGeographicReferenceResult {
  version: string;
  status: 'staged' | 'active' | 'rejected';
  diagnostics: Array<{
    code: string;
    field: string;
    message: string;
    severity: 'warning' | 'error';
  }>;
  counts: { communes: number; departments: number };
}
```

## Processing contract

1. Parse and validate the local commune source without writing the active version.
2. Reject duplicate INSEE codes, missing required fields, malformed CSV rows, missing
   department references, insufficient coverage, or missing provenance/license.
3. Normalize commune names and compute the version checksum before touching the database.
4. In one PostgreSQL transaction, insert the `geographic_reference_version` row with
   `status = 'staged'`, then its department and commune rows in batched `createMany` calls.
5. In a second transaction, set the previously active row to `superseded` and the validated
   row to `active`; the partial unique index on `status = 'active'` rejects a second active
   version.
6. After the commit succeeds, enqueue re-enrichment against the new version.
7. On any failure, return diagnostics; the previous active version and every published
   event remain readable and unchanged.

## Idempotency and concurrency

The version identifier is content-addressed, so repeating the same refresh finds the
existing `staged` or `active` version and performs no new insert. Activation is serialized
by the database constraint: a concurrent activation fails with a unique-violation that is
reported as a retryable diagnostic rather than a second active version. A reader resolves
the active version once per transaction and reads only rows carrying that `versionId`.

## Operational signals

Record refresh status, version, source, counts, validation error count, duration, worker
ownership, and failure context in the existing ingestion ledger and logs. Do not include
raw payload secrets or uncontrolled source content in diagnostics.
