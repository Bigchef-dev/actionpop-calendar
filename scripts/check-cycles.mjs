import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const TARGETS = ['packages/core/src', 'apps/worker/src', 'apps/api/src'];
const BASELINE = '.madge-baseline.json';
const update = process.argv.includes('--update');

const madgeModule = await import('madge');
const madge = madgeModule.default ?? madgeModule;

const result = await madge(TARGETS, {
  fileExtensions: ['ts'],
  tsConfig: 'tsconfig.base.json',
  excludeRegExp: [/\.test\.ts$/, /\.d\.ts$/],
});

// A cycle is order-independent: sort the members so moving a file does not look like
// a new violation.
const normalise = (cycle) => cycle.map((file) => file.replaceAll('\\', '/')).sort();
const current = result.circular().map(normalise);
const keys = current.map((cycle) => cycle.join(' > '));

/** A missing or unreadable baseline accepts no cycle yet, so every cycle is reported. */
function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {
    return [];
  }
}

const baseline = readBaseline();

const known = new Set(baseline);
const introduced = current.filter((cycle) => !known.has(cycle.join(' > ')));
const resolved = baseline.filter((key) => !keys.includes(key));

if (update) {
  writeFileSync(BASELINE, `${JSON.stringify(keys.sort(), null, 2)}\n`);
  process.stdout.write(`baseline updated with ${keys.length} accepted cycle(s)\n`);
  process.exit(0);
}

if (resolved.length > 0) {
  process.stdout.write(`resolved ${resolved.length} accepted cycle(s); run with --update\n`);
}
if (introduced.length > 0) {
  process.stderr.write(`✖ ${introduced.length} new circular dependency(ies):\n`);
  for (const cycle of introduced) process.stderr.write(`  - ${cycle.join(' > ')}\n`);
  process.exit(1);
}

process.stdout.write(`no new circular dependencies (${keys.length} accepted)\n`);
