# Research: Geographic Enrichment

## Decision: Keep the first release dependency-light

**Decision**: Use TypeScript/Node.js 20, Zod, ioredis, BullMQ, Fastify, and Vitest already present in the workspace. Add no CSV or geometry package for the first release.

**Rationale**: The input set is bounded at 34,868 CSV rows and 559 constituency features. The repository has no parser or geometry dependency today, and small pure modules are easier to test and keep below the project's maintainability target.

**Alternatives considered**: `csv-parse` would reduce parser code but adds a dependency for a controlled local file. Turf or `rbush` would add geometry/indexing weight before measurement shows a need. Revisit either option if source formats become less controlled or the reference volume grows materially.

## Decision: Parse the commune CSV with a streaming RFC 4180 state machine

**Decision**: Read the CSV with `node:fs` and `node:readline` using `crlfDelay: Infinity`; parse quoted commas, escaped quotes, and multiline quoted fields. Validate the header and field count, and retain codes as strings. Index only the required columns: `code_insee`, commune name, region, department, EPCI, `code_postal`, and `codes_postaux`.

**Rationale**: The `codes_postaux` field contains quoted comma-separated values, so `split(',')` is invalid. Streaming bounds memory and makes malformed-row diagnostics explicit.

**Alternatives considered**: Loading the entire file and using a simple split is smaller but incorrect for quoted fields. A full generic import framework is unnecessary for one local reference source.

## Decision: Resolve communes by exact postal-code plus city

**Decision**: Normalize input with trim, Unicode NFC, and case-insensitive comparison without removing accents. Expand `codes_postaux` into individual index entries. Return a commune only for one unique exact match. Postal-only, fuzzy, homonymous, or ambiguous matches return an unresolved diagnostic. If the exact postal match conflicts with GPS, postal data wins and GPS remains raw.

**Rationale**: This follows the clarified business rule and prevents silent assignment to the wrong commune. Stable INSEE identifiers remain reference-data identifiers, not required incoming event fields.

**Alternatives considered**: Fuzzy matching and postal-only matching are rejected because they can select a wrong commune. GPS-first resolution is rejected because the specification makes the exact postal match authoritative.

## Decision: Normalize and validate Polygon/MultiPolygon GeoJSON before querying

**Decision**: Validate a `FeatureCollection`, required `codeCirconscription`, department and name properties, finite coordinates, closed rings, and minimum ring sizes. Normalize Polygon and MultiPolygon features to one internal polygon representation with bounding boxes and holes. Use bounding-box rejection followed by ray casting; check `onSegment` before ray casting so boundary points are included. Return every matching constituency ID.

**Rationale**: The supplied GeoJSON has 559 features and both Polygon and MultiPolygon geometries. A linear scan with bounding boxes is sufficient at this size and makes boundary semantics explicit and testable.

**Alternatives considered**: An R-tree or Turf-based implementation may improve large datasets but is unnecessary before a measured performance failure. Returning the first match is rejected because boundary points can legitimately produce multiple links.

## Decision: Version references with immutable Redis data and an atomic pointer

**Decision**: Store immutable staged version data under `actionpop:geo:reference:{version}:...`, a manifest with `status`, provenance, counts, and checksums, and one active pointer at `actionpop:geo:reference:active`. Activate only with a Redis Lua script that verifies the staged manifest and sets the pointer atomically. Retain the previous version until explicit cleanup.

**Rationale**: Readers always resolve one complete version, and failed refreshes cannot expose partial data. This avoids the existing snapshot publisher's unsafe non-EVAL fallback for this contract.

**Alternatives considered**: Independent GET/SET activation is rejected because readers can observe a mixed version. Replacing the current version in place is rejected because rollback and failed-refresh guarantees would be lost.

## Decision: Re-enrich asynchronously after activation

**Decision**: Store `referenceVersion` and enrichment diagnostics on enriched events. After a valid reference becomes active, enqueue re-enrichment; preserve source ID, raw location, dates, and event identity while updating geographic links. The first release may identify affected events with a full scan; reverse indexes can be added after measurement.

**Rationale**: Dataset activation remains fast and atomic, while affected events can be repaired with durable worker processing.

**Alternatives considered**: Blocking activation until all events are re-enriched increases operational risk and makes rollback harder. Re-fetching source events is rejected because raw location data is retained specifically to support replay.

## Decision: Keep postal and constituency business rules separate

**Decision**: Postal commune resolution accepts address fields and a postal reference index only. Constituency resolution accepts a GeoJSON-derived geometry index and a point only. Department/region/EPCI relationships are resolved from reference records. The modules are independently testable and kept within the 100-line target where practical.

**Rationale**: This directly enforces the clarified clean-business boundary and keeps changes in the supplied datasets from coupling unrelated rules.

**Alternatives considered**: A single cascade service containing parsing, geometry, postal lookup, and persistence would be shorter initially but violates independent testing and maintainability goals.
