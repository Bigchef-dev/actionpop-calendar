import { execFileSync } from 'node:child_process';
import process from 'node:process';

// Permissive licenses the project accepts for any installed package.
const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  // MIT-0 is MIT without the attribution requirement: strictly more permissive than MIT.
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'WTFPL',
]);

// Packages whose license never reaches a published artifact. Each exemption states why
// it is acceptable; anything else outside the allowlist fails the check.
const EXEMPT = new Map([
  ['@cspell/dict-en-common-misspellings', 'CC BY-SA 4.0 applies to dictionary data, dev-only'],
  ['elkjs', 'EPL-2.0, dev-only: pulled in by @prisma/studio-core inside the Prisma CLI'],
]);

/** `A OR B` passes when any atom passes; `A AND B` passes only when all atoms pass. */
function isAcceptable(expression) {
  const groups = expression.split(/\s+OR\s+/i);
  return groups.some((group) => {
    const atoms = group.replaceAll(/[()]/g, '').split(/\s+AND\s+/i);
    return atoms.every((atom) => ALLOWED.has(atom.trim()));
  });
}

const raw = execFileSync('pnpm', ['licenses', 'list', '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const byLicense = JSON.parse(raw);

const offenders = [];
let checked = 0;
for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    checked += 1;
    if (EXEMPT.has(pkg.name) || isAcceptable(license)) continue;
    offenders.push({ name: pkg.name, license });
  }
}

if (offenders.length > 0) {
  process.stderr.write(`✖ ${offenders.length} package(s) with a disallowed license:\n`);
  for (const offender of offenders) {
    process.stderr.write(`  - ${offender.name}: ${offender.license}\n`);
  }
  process.exit(1);
}

process.stdout.write(`licenses accepted for ${checked} package(s)\n`);
