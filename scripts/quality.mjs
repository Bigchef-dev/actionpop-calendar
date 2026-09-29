import { spawnSync } from 'node:child_process';
import process from 'node:process';

const checks = [
  ['typecheck', ['typecheck']],
  ['lint', ['lint']],
  ['unit tests', ['test']],
  ['integration tests', ['test:integration']],
  ['build', ['build']],
];

for (const [name, args] of checks) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  process.stdout.write(`quality check passed: ${name}\n`);
}
