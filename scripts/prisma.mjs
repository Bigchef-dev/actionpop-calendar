#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
config({ path: resolve(process.cwd(), '.env.local'), override: true, quiet: true });

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === '') {
  console.error('DATABASE_URL is missing. Define it in .env or .env.local.');
  process.exit(1);
}

if (/\s/.test(databaseUrl)) {
  console.error(
    `DATABASE_URL contains whitespace: "${databaseUrl}". Remove anything after the connection string.`,
  );
  process.exit(1);
}

function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || 'default'}${parsed.pathname}`;
  } catch {
    return '<unparsable DATABASE_URL>';
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === undefined) {
  console.error('Usage: node scripts/prisma.mjs <command> [args...]');
  process.exit(1);
}

console.log(`Prisma target: ${describeTarget(databaseUrl)}`);

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(
  pnpm,
  ['exec', 'prisma', command, ...args, '--schema=prisma/schema.prisma'],
  { stdio: 'inherit', env: process.env },
);

child.on('exit', (code, signal) => {
  const exitCode = signal === null ? code ?? 1 : 1;
  if (exitCode !== 0) {
    console.error(
      `\nPrisma failed. If the error is P1001, Postgres is not reachable at ${describeTarget(databaseUrl)}.`,
    );
    console.error(
      'Start the dependencies with `sudo docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.dev.yml up -d redis postgres`,',
    );
    console.error('or add your user to the docker group and run `pnpm dev:infra`.');
  }
  process.exit(exitCode);
});
