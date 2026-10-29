# Research: Filtered iCalendar Feed

## Decision: Extract shared RFC 5545 primitives instead of extending the existing feed

**Decision**: Move text escaping, line folding and CRLF line assembly into `packages/core/src/calendar/ical-writer.ts`, then implement both the existing group feed and the new filtered calendar on top of it.

**Rationale**: The existing `ical-feed.ts` escapes text but never folds lines, so a long description already produces a physically invalid line. RFC 5545 §3.1 caps a content line at 75 octets, and the new metadata adds many more lines per entry. Two independent writers would duplicate escaping rules and diverge on folding; one shared primitive keeps a single correctness point and lets each document builder stay small and readable.

**Alternatives considered**: Extending `ical-feed.ts` in place was rejected because the file would carry two document shapes and breach the 100–150 line target. A fully separate filtered writer was rejected because the escaping and folding bugs would need fixing twice.

## Decision: Resolve commune names in a dedicated step before querying

**Decision**: Add `CommuneNameResolver` in `packages/core/src/geography`, which normalizes each supplied name with the existing `normalizeGeographicName` helper, submits it to `GeographicReferenceReader.findCommunesByNormalizedName` against the active version, disambiguates with `department` when a name is ambiguous, and returns either INSEE codes or actionable diagnostics. The calendar query then filters on the resolved codes.

**Rationale**: Name resolution is a business rule with a diagnostic outcome, not a SQL predicate. Keeping it as a separate step lets it be tested against a stub reader without PostgreSQL, keeps the query a plain equality filter, and reuses the reference reader and normalization already proven by the geographic enrichment feature. The two-step cost is one extra round trip per distinct name, bounded by the small number of names a user supplies.

**Alternatives considered**: A join inside the query hides the ambiguity rule in SQL and makes the diagnostic path hard to test. An in-process index loaded at startup goes stale as soon as an operator activates a new reference version, which contradicts the enrichment feature's activation model.

## Decision: Add a dedicated calendar read model

**Decision**: Create `PostgresCalendarEventQuery` in `packages/core/src/persistence`, exposing a `listCalendarEvents(criteria, window, limit)` method that selects the fields the calendar needs and returns a typed projection.

**Rationale**: `PostgresEventQuery.list` returns seven fields and backs the `/events` contract. Widening it would change an already documented response and couple two contracts to one select. A dedicated read model keeps each contract independently testable and lets the calendar select only the columns it emits.

**Alternatives considered**: Extending `PostgresEventQuery` with a second method keeps one file but lets one contract drift into the other. Querying Prisma directly from the controller would put persistence in the transport layer and break the first constitution principle.

## Decision: Compute the window with fixed day offsets

**Decision**: Express the lookback and lookahead as whole days (`30` and `90` by default), compute both boundaries from the request instant in `Europe/Paris`, and select events where `end_time >= windowStart AND start_time <= windowEnd`.

**Rationale**: Fixed days are unambiguous, trivially testable at the boundary, and immune to month-length and leap-year surprise. The overlap predicate matches the spec: an event straddling either boundary stays visible. Month-length variation is not meaningful for a rolling subscription that refreshes many times per day.

**Alternatives considered**: Calendar-month arithmetic (`addMonths`) reads closer to the wording but makes boundary tests depend on the calendar month. A dual unit (months with a day override) doubles the validation surface for no user benefit.

## Decision: One YAML file with environment precedence

**Decision**: Load configuration from `APP_CONFIG_FILE`, defaulting to `config/actionpop.yaml`, then overlay environment variables, then validate the merged result with Zod. Ship `config/actionpop.example.yaml` as the complete commented reference.

**Rationale**: The repository currently configures everything through environment variables, which is convenient inside containers but unreadable as a whole. A versioned YAML document makes the complete configuration reviewable, keeps comments next to each setting, and stays deployable because environment variables still win, so Compose files and secret injection keep working unchanged. Validation with Zod reuses the dependency and error style already present in `packages/core`.

**Alternatives considered**: `js-yaml` is only a transitive dependency today, so adopting it would still add a direct dependency while offering a smaller API and no comment-preserving document model. JSON cannot carry the comments that make a configuration file self-documenting. Environment-only configuration cannot express nested calendar settings without inventing a naming convention.

**Compatibility note**: when neither `APP_CONFIG_FILE` nor `config/actionpop.yaml` exists, the loader continues with built-in defaults plus environment variables and logs a single warning. An explicitly named file that is missing is a startup error. This keeps existing deployments working while making the file the primary source.

## Decision: Derive the ETag from the produced body

**Decision**: Compute a truncated SHA-256 digest of the serialized calendar body, expose it as a weak-free quoted `ETag`, and answer `304` when `If-None-Match` matches.

**Rationale**: The body is already assembled before the response is written, so hashing it costs one pass over a few kilobytes. It is exact: any change in a title, a metadata value, an event set or a reference code changes the tag, which a counter or a maximum `updated_at` cannot guarantee.

**Alternatives considered**: An event-count plus `max(updatedAt)` tag misses content edits that do not touch `updated_at`. Omitting the tag leaves clients re-downloading the whole calendar on every refresh.

## Decision: Model metadata as levels over families

**Decision**: Represent metadata as a level (`off`, `identity`, `standard`, `full`) plus per-family switches, and emit properties from a declarative table so the document contract and the emitter read the same source.

**Rationale**: Operators need one obvious knob for the common cases and a finer knob for exceptions. A declarative table keeps property names, levels and value domains in one place, which is exactly what the OpenAPI drift test must compare against, and keeps the emitter under the module size target.

**Alternatives considered**: Naming every property as an individual boolean makes a long configuration file. Hardcoding the property list inside the emitter makes the drift test a copy of the implementation rather than an independent check.

## Decision: Carry diagnostic machine parts as property parameters

**Decision**: Emit `X-ACTIONPOP-GEO-DIAGNOSTIC;CODE=…;FIELD=…;SEVERITY=…:<message>`, keeping only the human-readable message in the value.

**Rationale**: RFC 5545 property parameters are already a structured, escaped channel. Splitting the machine-readable parts out of the value means no delimiter needs inventing, no message content can break parsing, and consumers can filter diagnostics on a parameter without parsing free text.

**Alternatives considered**: A single delimited string requires escaping the delimiter inside messages and makes the contract fragile. One property per diagnostic field multiplies lines per entry beyond the value of the data.

## Decision: Bound group properties at five

**Decision**: Emit at most five `X-ACTIONPOP-GROUP` properties per entry by default, ordered by group identifier, with the ceiling configurable and truncation observable.

**Rationale**: An event shared by many groups would otherwise emit an unbounded number of properties, inflating the calendar for every subscriber. Five covers the common case and keeps an entry readable. Deterministic ordering makes the emitted set stable between requests.

**Alternatives considered**: Emitting every group makes the payload grow with fan-out and can dominate the entry size. Emitting a count without identifiers loses the reconciliation value that motivates the property.

## Decision: Use the event's update timestamp and period token as observation metadata

**Decision**: Replace a content-hash property with `X-ACTIONPOP-UPDATED-AT` and `X-ACTIONPOP-PERIOD`, both derived from persisted ingestion state.

**Rationale**: `content_hash` is nullable in `event_record`, so a hash property would be absent exactly where reconciliation matters. `updated_at` and `last_seen_period` are always written by the ingestion path, and the period token tells a consumer which ingestion run observed the event. The spec records explicitly that these describe the last successful observation, not content equality, so consumers compare event content to detect a change.

**Alternatives considered**: Guaranteeing a hash at ingestion would require a migration and a backfill for historical rows, expanding the feature beyond its scope. Exposing only the identifier forces consumers to fetch each event to detect updates.

## Decision: Keep the read path independent from BullMQ and Redis

**Decision**: Serve the calendar from PostgreSQL only, through the new read model, with no Redis cache and no queue interaction.

**Rationale**: The published event rows already carry the geographic attachment, so the read path needs no reference lookup beyond name resolution, and no cache to invalidate. Independence from the feed repository means a Redis outage cannot blank the filtered calendar, satisfying the requirement that the two surfaces fail separately.

**Alternatives considered**: Reusing the Redis dataset repository would tie the calendar to the group feed's publication state and couple the two failure modes. A Redis cache of rendered calendars adds invalidation complexity for a body that is cheap to render.
