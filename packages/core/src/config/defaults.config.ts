/**
 * Built-in defaults for every runtime setting.
 *
 * A deployment can override most of these through the configuration file or an environment
 * variable, so each entry states the behaviour the project chooses when nothing is configured —
 * the objective behind the value, not the value restated.
 */

/**
 * Length of one ingestion cycle.
 *
 * This is the project's clock: job identity, the processing period, the cycle-metric window and
 * the ledger grace all derive from it, so moving it changes the granularity of the whole pipeline
 * rather than only the dispatcher's wait.
 */
export const DEFAULT_DISPATCHER_INTERVAL_MS = 15 * 60 * 1000;

/** Millisecond unit for the whole-day offsets the calendar window applies around a request. */
export const DAY_MS = 24 * 60 * 60 * 1000;

// --- Public calendar feed ---------------------------------------------------------------
// What a subscriber receives, and for how long it may keep it. An operator can tighten any of
// these per deployment; the defaults are the contract the project publishes out of the box.

/** Lets a deployment stop serving the feed (answering `404`) while keeping the ingested data. */
export const DEFAULT_CALENDAR_ENABLED = true;

/** How far behind "today" the feed keeps events visible, so a recent event stays reachable. */
export const DEFAULT_CALENDAR_LOOKBACK_DAYS = 30;

/** How far ahead the feed publishes, so a long-running source cannot make the answer unbounded. */
export const DEFAULT_CALENDAR_LOOKAHEAD_DAYS = 90;

/** Ceiling on events per answer: protects memory and client rendering on dense territories. */
export const DEFAULT_CALENDAR_MAX_ENTRIES = 1000;

/** Ceiling on the group names carried by one event, so a heavily attributed event stays small. */
export const DEFAULT_CALENDAR_MAX_GROUPS_PER_EVENT = 5;

/** How long a consumer may reuse a feed answer before asking again, trading freshness for load. */
export const DEFAULT_CALENDAR_REVALIDATION_SECONDS = 900;

/** Detail level published by default; the middle ground between usefulness and payload size. */
export const DEFAULT_CALENDAR_METADATA_LEVEL = 'standard';

// --- Ingestion cost ---------------------------------------------------------------------
// Discovery is the expensive, upstream-facing part of a cycle. These defaults bound it, so a
// large catalogue cannot turn one cycle into an unbounded crawl or an unbounded burst of jobs.

/** Ceiling on newly discovered groups enrolled in one cycle, so one cycle stays predictable. */
export const DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE = 200;

/** Jobs processed at once by a worker; bounds the database and CPU pressure of one container. */
export const DEFAULT_INGESTION_WORKER_CONCURRENCY = 2;

/** Lets a deployment run the catalogue cycle without the map discovery step. */
export const DEFAULT_MAP_DISCOVERY_ENABLED = true;

/** How old a map observation may be before it is re-read, so discovery never trusts stale rows. */
export const DEFAULT_MAP_FRESHNESS_HORIZON_MS = 60 * 60 * 1000;

/**
 * How often the whole map is reconciled against the reference. A full sweep is much more
 * expensive than a cycle, so it runs on its own slower cadence instead of every cycle.
 */
export const DEFAULT_MAP_RECONCILIATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// --- Timeouts and retry budgets ---------------------------------------------------------
// Prisma's five-second interactive default is too small for the bulk transactions below, while
// an unbounded wait would let one slow dependency stall the worker. Each value names the risk it
// removes, not just a duration.

/**
 * Bulk reference staging inserts tens of thousands of communes in one transaction; the budget
 * must cover the whole step because a rollback has to undo all of it.
 */
export const STAGE_TRANSACTION_TIMEOUT_MS = 60_000;

/**
 * Publishing a dataset swaps many rows atomically; a partial publication must never be visible,
 * so the transaction may run longer than the interactive default.
 */
export const PUBLICATION_TIMEOUT_MS = 60_000;

/** Budget for the preflight dependency probes: startup must fail fast instead of hanging. */
export const DEFAULT_TIMEOUT_MS = 5_000;

/** Base wait before retrying a request the upstream rate-limited. */
export const DEFAULT_RATE_LIMIT_DELAY_MS = 2_000;

/** Ceiling on the exponential backoff, so a throttled source cannot stall a cycle indefinitely. */
export const MAX_RATE_LIMIT_DELAY_MS = 30_000;

/** Spread added to the retry wait, so concurrent workers do not retry in lockstep. */
export const RATE_LIMIT_JITTER_MS = 250;

/**
 * How long a live ledger status may stay untouched before it is treated as abandoned. Four
 * cycles, because nothing legitimate survives that long.
 */
export const LEDGER_GRACE_MS = 60 * 60 * 1000;

/**
 * Concurrent transitions can queue on the same scope row under load; the interactive default
 * would abort a wait that is legitimate rather than stuck.
 */
export const LEDGER_TRANSACTION_TIMEOUT_MS = 15_000;

/**
 * Time allowed to obtain a pooled connection, kept apart from the transaction budget so a
 * saturated pool is diagnosable as such rather than reported as a slow statement.
 */
export const LEDGER_TRANSACTION_MAX_WAIT_MS = 10_000;

/**
 * A catalogue sync writes the whole directory in one transaction; the default is too tight while
 * ingestion jobs hold connections.
 */
export const CATALOGUE_SYNC_TIMEOUT_MS = 60_000;

/** Separate connection-acquisition budget for the catalogue sync, for the same reason. */
export const CATALOGUE_SYNC_MAX_WAIT_MS = 10_000;

/**
 * A group address older than this is re-read from the upstream detail resource, so a group that
 * moved is corrected without re-reading every detail on every cycle. A failed read keeps the
 * previous attachment and retries on the next cycle.
 */
export const DEFAULT_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// --- Observability ----------------------------------------------------------------------

/** Label recorded for a deployment that does not identify itself, so metrics stay queryable. */
export const DEFAULT_OBSERVABILITY_DEPLOYMENT = 'unknown';

/** Whether client usage telemetry is sent unless a deployment explicitly opts out. */
export const DEFAULT_TELEMETRY_ENABLED = true;
