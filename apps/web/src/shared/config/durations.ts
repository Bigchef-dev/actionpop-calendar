/**
 * Every timing constant of the web application lives here.
 *
 * `@actionpop/web` does not depend on `@actionpop/core`, so it cannot import the shared
 * `packages/core/src/config/defaults.config.ts`. This module is the single place the web bundle
 * declares a duration, and the deliberate deviation from that core file.
 */
export const FLUSH_INTERVAL_MS = 2000;
export const VISIT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const HOUR_MS = 3_600_000;
/** Open-Meteo publishes a 16-day forecast horizon. */
export const FORECAST_HORIZON_DAYS = 16;
export const LONG_PRESS_MS = 300;
export const DEBOUNCE_MS = 150;
