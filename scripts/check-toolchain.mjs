import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

// Dev tooling must run on the Node version CI actually installs. A new tool that
// requires a newer major breaks the pipeline without any code change: `cspell@10`
// demanding Node 22 while CI installs Node 20 is exactly that failure.
//
// The floor is read from the workflows (the latest patch of the declared major, which
// is what `actions/setup-node` installs), so raising CI's Node also relaxes the check.

function parseVersion(value) {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(value).trim());
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compare(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

/** Evaluates the subset of node-semver ranges used in `engines` fields. */
function satisfies(version, rawRange) {
  // Ranges appear as both ">=20" and ">= 20"; drop the spacing so each comparator
  // keeps its version token.
  const range = rawRange.replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1');
  return range
    .split('||')
    .map((alternative) => alternative.trim())
    .filter((alternative) => alternative !== '')
    .some((alternative) =>
      alternative.split(/\s+/).every((comparator) => satisfiesComparator(version, comparator)),
    );
}

function satisfiesComparator(version, comparator) {
  const operator = /^(\^|~|>=|>|<=|<|=)?/.exec(comparator)?.[1] ?? '';
  const target = parseVersion(comparator.slice(operator.length));
  if (target === undefined) return true;

  if (operator === '^') {
    if (compare(version, target) < 0) return false;
    const [major, minor] = target;
    if (major > 0) return version[0] === major;
    if (minor > 0) return version[0] === 0 && version[1] === minor;
    return version[0] === 0 && version[1] === 0 && version[2] === target[2];
  }
  if (operator === '~') {
    return compare(version, target) >= 0 && version[0] === target[0] && version[1] === target[1];
  }

  const order = compare(version, target);
  if (operator === '>=') return order >= 0;
  if (operator === '>') return order > 0;
  if (operator === '<=') return order <= 0;
  if (operator === '<') return order < 0;
  return order === 0;
}

/** The Node major the workflows install, as the latest patch of that major. */
function ciNodeFloor() {
  const directory = '.github/workflows';
  if (!existsSync(directory)) return undefined;
  const majors = new Set();
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue;
    const content = readFileSync(join(directory, entry), 'utf8');
    for (const match of content.matchAll(/node-version:\s*'?"?(\d+)/g)) {
      majors.add(Number(match[1]));
    }
  }
  if (majors.size === 0) return undefined;
  return [Math.max(...majors), 999, 999];
}

function workspaceManifests() {
  const manifests = ['.'];
  for (const parent of ['packages', 'apps']) {
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(parent, entry.name, 'package.json'))) {
        manifests.push(join(parent, entry.name));
      }
    }
  }
  return manifests;
}

function installedEngines(name, from) {
  const candidate = join(from, 'node_modules', name, 'package.json');
  if (!existsSync(candidate)) return undefined;
  return JSON.parse(readFileSync(candidate, 'utf8')).engines?.node;
}

const floor = ciNodeFloor();
if (floor === undefined) {
  process.stderr.write('no node-version found under .github/workflows\n');
  process.exit(1);
}

const offenders = [];
const seen = new Set();
for (const directory of workspaceManifests()) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    const engine = installedEngines(name, directory);
    if (engine === undefined || seen.has(`${name}@${engine}`)) continue;
    seen.add(`${name}@${engine}`);
    if (!satisfies(floor, engine)) offenders.push({ name, engine, directory });
  }
}

const floorText = `${floor[0]}.x`;
if (offenders.length > 0) {
  process.stderr.write(
    `✖ ${offenders.length} dev dependency/ies exclude the Node major CI installs (${floorText}):\n`,
  );
  for (const offender of offenders) {
    process.stderr.write(
      `  - ${offender.name} requires "${offender.engine}" (${offender.directory})\n`,
    );
  }
  process.stderr.write(
    'Pin a compatible major, or raise node-version in every workflow and engines.node together.\n',
  );
  process.exit(1);
}

process.stdout.write(`dev toolchain supports Node ${floorText} (${seen.size} packages checked)\n`);
