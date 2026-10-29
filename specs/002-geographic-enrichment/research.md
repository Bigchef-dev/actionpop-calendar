# Research: Geographic Enrichment

## Decision: Derive geography from the stated event fields, not from coordinates

**Decision**: Attach events using `location.country`, `location.departement`, `location.commune.name`, and the `location.zip` + `location.city` fallback pair, all already provided by the Action Populaire events contract. Do not read `location.coordinates` for enrichment, and require no geocoding or spatial dataset.

**Rationale**: The contract exposes country, department code, commune name, city, and postal code directly. Matching coordinates against a boundary dataset adds a source of error and a heavy dataset for information the source already states. A stated country makes the French/international decision deterministic.

**Alternatives considered**: Coordinate matching against constituency or commune geometries is rejected for this version because it introduces spatial ambiguity, extra reference data, and failure modes without improving the fields the source already provides. Coordinates remain raw source data: the existing `geo_point` storage is neither dropped nor modified in this release.

## Decision: Store the geographic reference in PostgreSQL through Prisma

**Decision**: Model the reference as three Prisma models — `GeographicReferenceVersion`, `DepartmentReference` and `CommuneReference` — created by a dedicated migration and accessed through the existing Prisma client. Do not store reference or event geography in Redis, and do not read the CSV at enrichment time.

**Rationale**: PostgreSQL is already the project's source of truth (`prisma/schema.prisma`, `0001_initial_postgres_persistence`, `PostgresCalendarDatasetRepository`, `PostgresSnapshotPublisher`, `PostgresIngestionLedgerStore`). Keeping the reference in the same transactional store lets activation and publication share one consistency model, avoids a second persistence technology to operate, and reuses the existing migration and health-check workflow.

**Alternatives considered**: Redis references plus a pointer key are rejected because Redis is now only the BullMQ transport, and a second store would reintroduce dual-write risk. Reading the CSV on every enrichment is rejected because it removes versioning, provenance, and validation guarantees.

## Decision: Keep the first release dependency-light

**Decision**: Use TypeScript/Node.js 20, Zod, Prisma, BullMQ, Fastify, and Vitest already present in the workspace. Add no CSV, geometry, geocoding or caching package.

**Rationale**: The input set is a single bounded CSV file with 34,868 data rows. The repository has no parser dependency today, and small pure modules are easier to test and keep below the project's maintainability target.

**Alternatives considered**: `csv-parse` would reduce parser code but adds a dependency for a controlled local file. Revisit it if source formats become less controlled or the reference volume grows materially.

## Decision: Parse the commune CSV with a streaming RFC 4180 state machine

**Decision**: Read the CSV with `node:fs` and `node:readline` using `crlfDelay: Infinity`; parse quoted commas, escaped quotes, and multiline quoted fields. Validate the header and field count, and retain codes as strings. Index the required columns: `code_insee`, `nom_standard`, `nom_sans_pronom`, `code_postal`, `codes_postaux`, `dep_code`, and `dep_nom`.

**Rationale**: The `codes_postaux` field contains quoted comma-separated values, so `split(',')` is invalid. Streaming bounds memory and makes malformed-row diagnostics explicit.

**Alternatives considered**: Loading the entire file and using a simple split is smaller but incorrect for quoted fields. A full generic import framework is unnecessary for one local reference source.

## Decision: Write reference versions with batched `createMany` inside one transaction

**Decision**: Insert one `geographic_reference_version` row, then its department and commune rows in batched `createMany` calls (about 1,000 rows per batch) inside a single Prisma transaction, with normalization keys computed before the write. Version rows start as `staged`; no commit makes a version partly active.

**Rationale**: 34,868 commune rows fit comfortably in batched inserts, so a raw `COPY` escape hatch is unnecessary. A single transaction keeps staging invisible and avoids orphan rows if validation or insertion fails mid-way.

**Alternatives considered**: `COPY FROM STDIN` would be faster but bypasses Prisma, needs raw SQL and a separate code path, and buys little at this volume. Row-by-row `upsert` is rejected because it multiplies round trips by 34,868.

## Decision: Resolve communes by exact normalized name, then by unique postal code plus city

**Decision**: Normalize both sides with trim, Unicode NFC, case folding, accent removal, and punctuation/whitespace folding. Match `location.commune.name` first against `normalized_name` or `pronoun_free_normalized_name` of the active version, then `location.city` with the same rule when no commune name is stated. Require exactly one match; when several communes share the normalized name, disambiguate with the stated department code or the department implied by the postal prefix. The postal code never selects a commune.

**Rationale**: The source states the commune name for most events, so using it first reflects the most precise available field. The supplied dataset holds a single generic postal code for multi-postal communes (`69000`, `75000`, `13000`) and contains no arrondissement rows, so an equality match on `zip` would never attach Paris, Lyon or Marseille; deriving only the department prefix from the postal code keeps `75005 Paris` attachable while staying deterministic. Restricting matching to exact normalized names prevents silent assignment to a similarly named commune.

**Alternatives considered**: Fuzzy or phonetic matching is rejected because it can select the wrong commune. Postal-first resolution is rejected because the dataset cannot express multi-postal communes. Treating `Paris 1er` as `Paris` was rejected because arrondissement modelling is deferred; the event stays unresolved with a diagnostic. Holding an in-memory index of the active version was rejected because PostgreSQL B-tree indexes answer the same question without an invalidation problem.

## Decision: Query the reference through indexed SQL, without a cache

**Decision**: Resolve the active version once per enrichment transaction with a filtered lookup, then run indexed queries: `(version_id, normalized_name)`, `(version_id, pronoun_free_normalized_name)` and `(version_id, department_code)`. Do not add Redis or in-process caching.

**Rationale**: Indexed equality lookups are predictable, always reflect the active version, and remove cache invalidation as a failure mode. Ingestion is batched and nowhere near the scale where a cache matters.

**Alternatives considered**: An in-memory index loaded at worker startup adds a stale-data window after activation and duplicates the reference in process memory. Redis caching contradicts the decision to keep geographic state in one store.

## Decision: Validate the stated department code and keep discrepancies visible

**Decision**: Link the department whose code equals `location.departement` when the code exists in the active reference. When the code is unknown and a commune is resolved, link the commune's reference department and emit a diagnostic. When the stated code and the resolved commune's department disagree, keep both raw values, link the stated department, and emit `department_commune_mismatch`. Department codes are strings, including `2A` and `2B`.

**Rationale**: The department is a stated business attribute that users filter on; discarding it would lose source intent, while silently reconciling it would hide data-quality problems. Diagnostics make the conflict actionable.

**Alternatives considered**: Deriving the department only from the commune hides a stated source field. Trusting the code without validation can surface a department that does not exist.

## Decision: Classify countries only from the stated value

**Decision**: Uppercase and retain the stated `location.country`. Treat `FR` as France, any other valid ISO 3166-1 alpha-2 value as an international classification with no French administrative link, and an absent, blank, or unsupported value as a diagnostic with no deduced country. Events with no country and no resolvable commune or department fall into `national events`.

**Rationale**: Guessing France from a blank field would produce false domestic events at the borders and for international events. A strict stated-value rule keeps the classification explainable.

**Alternatives considered**: Defaulting a blank country to `FR` is rejected because it fabricates data. Matching the country by city or postal code is rejected because no reliable international reference is part of this version.

## Decision: Denormalize the attachment on the event row

**Decision**: Store `reference_version`, `geographic_status`, `country_code`, `department_code`, `department_source`, `raw_department_code`, `raw_commune_name`, `commune_id` and `geographic_diagnostics` as columns on `event_record`, written in the same transaction as the snapshot publication. No foreign key to the reference tables is declared.

**Rationale**: One event has at most one country, one department and one commune, so columns match the cardinality, keep filtering join-free, and make duplicate results impossible. Reference versions are retained for replay and may later be pruned, so a foreign key would either block cleanup or force rewriting old events.

**Alternatives considered**: Link tables (`event_commune_link`, `event_department_link`) imply many-to-many and reintroduce the duplicate-suppression rule the spec had for constituencies. Storing geography on `location_record` was rejected because the same location can be shared while group-level geography is out of scope, and because filtering would then require a join for every query.

## Decision: Activate a version with one transaction and a partial unique index

**Decision**: Keep a `status` column (`staged`, `active`, `rejected`) on `geographic_reference_version` and add, in the migration's raw SQL, a unique partial index on `status` where `status = 'active'`. Activation runs inside one transaction: mark the previous active row as `superseded`, mark the validated row as `active`, then enqueue re-enrichment after commit.

**Rationale**: The database itself guarantees at most one active version, so a concurrent or crashed refresh cannot produce two competing references. Because the reference and the events live in the same database, activation and the subsequent publication are covered by one transactional consistency model.

**Alternatives considered**: A one-row pointer table works but adds a join to every lookup. An application-level check without a database constraint was rejected because it fails under concurrency. Prisma's schema language cannot express the partial index, so the migration must contain raw SQL; this is documented in the plan's complexity tracking.

## Decision: Re-enrich asynchronously after activation

**Decision**: After a version is activated, enqueue re-enrichment through the existing BullMQ pipeline; recompute each affected event from its retained raw location and update the geographic columns without changing `source_event_id`, dates, event type or raw location. The first release may identify affected events with a query on `reference_version`.

**Rationale**: Activation stays fast and atomic, while affected events are repaired by durable worker processing that already exists in the project.

**Alternatives considered**: Blocking activation until every event is re-enriched increases operational risk and makes rollback harder. Re-fetching source events is rejected because raw location data is retained specifically to support replay.

## Decision: Publish the filter contract through a Scalar page built from the service

**Decision**: Keep `@nestjs/swagger` as the document source (`/openapi.json`, created from the Nest modules in `apps/api/src/server.ts`) and render it with `@scalar/nestjs-api-reference` on `/reference`. The geographic parameters are described with `@nestjs/swagger` decorators on the controller, so the document is generated from the code rather than written by hand, and a contract test asserts that each parameter is still a string with its example.

**Rationale**: The API is already NestJS on Fastify, and both packages are already installed and mounted. Generating the document from the decorated route keeps a single source of truth, and rendering it with Scalar gives an interactive client that can be used to try combined criteria — including identifiers with leading zeroes such as `"01001"` — without writing a query by hand. String typing matters here because a numeric coercion would silently drop leading zeroes, which the specification forbids at every stage.

**Alternatives considered**: Hand-written Markdown would drift from the code and cannot execute a request. Serving only the raw OpenAPI JSON forces the reader to import it elsewhere. `@scalar/fastify-api-reference` would bypass Nest's decorator metadata and require documenting the controllers twice.

## Decision: Keep the stated country when the reference is unavailable

**Decision**: Classify the country before resolving the reference. When no version is active, publish the event with `geographic_status = unavailable`, keep `countryCode`, `rawDepartmentCode` and `rawCommuneName`, leave commune and department links empty, and emit a `reference_unavailable` error diagnostic.

**Rationale**: Country classification needs no reference data, so dropping it would discard correct information and make an outage look like a data defect. Administrative links still require the reference and stay empty, which keeps the failure explainable.

**Alternatives considered**: Failing the whole job blocks publication for every scope until an operator reacts. Publishing with no geography at all loses the one field that can still be computed.

## Decision: Keep country, commune, and department rules separate

**Decision**: Country classification consumes only the stated country value. Commune resolution consumes a commune name, or a postal code plus city pair, and the reference repository. Department validation consumes a stated department code and the reference relationships. Each module is independently testable and kept within the constitution's 100–150-line target where practical.

**Rationale**: This enforces the clarified clean business boundary and keeps changes in the supplied dataset from coupling unrelated rules.

**Alternatives considered**: A single cascade service containing parsing, name matching, department validation, and persistence would be shorter initially but violates independent testing and maintainability goals.

## Decision: One explicit representation per stage

**Decision**: Give every stage its own named type: raw source payload, validated event record, reference row, comparison key, geographic attachment, published document, query criteria, and diagnostic. Codes are strings at every stage, absent/`null`/empty all mean "not stated", and raw values are kept beside derived ones.

**Rationale**: Codes such as `01`, `2A` and postal codes lose information when coerced to numbers, and overwriting raw values makes a wrong attachment impossible to explain or replay. Named stage types also make the boundary tests in the quickstart direct instead of implicit.

**Alternatives considered**: Passing free-form objects between stages is shorter but silently converts codes and makes format drift undetectable. Storing only normalized values loses the source of truth needed for diagnostics and re-enrichment.

## Decision: Extend the event adapter to retain the raw geographic fields

**Decision**: The event location schema must expose `departement`, `commune.name`, `shortAddress` and `shortLocation` alongside the already-present `country`, `city` and `zip`; unknown fields stay ignored and a malformed payload still fails validation.

**Rationale**: The current location schema strips `departement` and `commune`, so enrichment would have no source value to read. Keeping the single validation boundary avoids re-reading raw payloads in domain code.

**Alternatives considered**: Re-parsing the raw payload downstream duplicates validation and couples modules. Making the schema passthrough is rejected because unknown fields would leak into the domain model without types.

## Decision: Validate event types against the observed source catalogue

**Decision**: Store `event_type` on the event row from `location.subtype.label`, and keep an `event_type_reference` table as a discovery registry. A well-formed label (lowercase words separated by hyphens) is accepted and registered on first sight; only a malformed label is rejected with `event_type_invalid` naming `subtype.label`. An event without a stated type is accepted.

**Rationale**: The platform owns an extensible enum the project cannot enumerate locally. Requiring a pre-registered value turned every platform addition into an ingestion outage — observed in practice with `meeting-presidentielle-2027`, `porte-a-porte`, `presentation-livre` and `reunion-groupe`. Validating the shape instead keeps garbage out, keeps ingestion resilient, and still records the vocabulary for filtering and discovery.

**Alternatives considered**: A hardcoded allowlist needs a deployment per addition. Rejecting unregistered values needs an operator sync before the first event of every new type. Accepting any string without a shape check admits arbitrary content into a filterable column.
