# Contract: Geographic Reference Refresh

## Operator action

The worker exposes an application-level refresh command; transport authentication and operator authorization remain deployment concerns. The command accepts configured local files and provenance metadata.

```ts
interface RefreshGeographicReferenceInput {
  communesPath: string;
  constituenciesPath: string;
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
  counts: { communes: number; constituencies: number };
}
```

## Processing contract

1. Read and validate both local sources without changing the active pointer.
2. Reject duplicate identifiers, missing required fields, malformed CSV rows, invalid geometry, invalid relationships, insufficient coverage, or missing provenance/license.
3. Write the complete immutable version and manifest with `status: staged`.
4. Execute one Redis Lua activation script that verifies the manifest and changes `actionpop:geo:reference:active` atomically.
5. Retain the previous version and enqueue re-enrichment against the new version.
6. On any failure, return diagnostics and leave the previous active pointer and published events untouched.

## Idempotency and concurrency

The version is content-addressed. Repeating the same refresh is a no-op after validation. Concurrent activation attempts are serialized by the Redis script; a reader resolves the active pointer once and reads only that version's immutable keys.

## Operational signals

Record refresh status, version, source, counts, validation error count, duration, worker ownership, and failure context. Do not include raw payload secrets or uncontrolled source content in diagnostics.
