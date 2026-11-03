export const CLIENT_KINDS = ['agenda', 'browser', 'automated', 'indeterminate'] as const;

export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Calendar applications: checked first because most also present a browser-like signature. */
const AGENDA_PATTERNS = [
  'thunderbird',
  'lightning',
  'calendaragent',
  'dataaccessd',
  'coredav',
  'caldav',
  'calendarsync',
  'google-calendar',
  'microsoft office',
  'outlook',
  'evolution',
  'gnome-calendar',
  'korganizer',
  'apple calendar',
  'busycal',
  'fantastical',
  'davmail',
];

const AUTOMATED_PATTERNS = [
  'bot',
  'crawler',
  'spider',
  'curl/',
  'wget/',
  'python-requests',
  'python-urllib',
  'go-http-client',
  'node-fetch',
  'axios/',
  'headlesschrome',
  'scrapy',
  'httpclient',
  'okhttp',
  'libwww-perl',
];

const BROWSER_PATTERNS = ['mozilla/', 'chrome/', 'firefox/', 'safari/', 'edg/', 'opr/'];

function matches(signature: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => signature.includes(pattern));
}

/**
 * Classifies a client by its declared signature only.
 *
 * An unrecognized or absent signature is `indeterminate` rather than a guess: the classes must
 * sum to the total, and silently folding unknowns into "browser" would inflate visitor counts.
 */
export function clientKind(signature: string | undefined): ClientKind {
  const normalized = (signature ?? '').trim().toLowerCase();
  if (normalized === '') return 'indeterminate';

  if (matches(normalized, AGENDA_PATTERNS)) return 'agenda';
  if (matches(normalized, AUTOMATED_PATTERNS)) return 'automated';
  if (matches(normalized, BROWSER_PATTERNS)) return 'browser';
  return 'indeterminate';
}
