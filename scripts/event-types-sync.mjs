#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { resolve } from 'node:path';

import { createPostgresClient, PostgresEventTypeRepository } from '../packages/core/dist/index.js';

config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
config({ path: resolve(process.cwd(), '.env.local'), override: true, quiet: true });

const path = process.env.EVENT_TYPES_PATH;
const inline = process.env.EVENT_TYPES;
const source = process.env.EVENT_TYPES_SOURCE ?? 'action-populaire';

if (path === undefined && inline === undefined) {
  console.error('Set EVENT_TYPES (comma separated) or EVENT_TYPES_PATH (JSON array).');
  process.exit(1);
}

const values =
  path === undefined
    ? (inline ?? '').split(',').map((value) => value.trim()).filter((value) => value !== '')
    : JSON.parse(await readFile(path, 'utf8'));

const prisma = createPostgresClient(process.env.DATABASE_URL);
try {
  await new PostgresEventTypeRepository(prisma).recordObservedEventTypes(values, source);
  console.log(JSON.stringify({ recorded: values.length, source }, null, 2));
} finally {
  await prisma.$disconnect();
}
