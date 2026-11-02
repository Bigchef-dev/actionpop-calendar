#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'node:path';

import {
  createPostgresClient,
  PostgresGeographicReferenceWriter,
} from '../packages/core/dist/index.js';
import { refreshGeographicReference } from '../apps/worker/dist/geography/reference-refresh.js';

config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
config({ path: resolve(process.cwd(), '.env.local'), override: true, quiet: true });

const communesPath = process.env.GEOGRAPHIC_COMMUNES_PATH ?? 'data/communes-france-2026.csv';
const source = process.env.GEOGRAPHIC_SOURCE ?? 'data/communes-france-2026.csv';
const license = process.env.GEOGRAPHIC_LICENSE ?? 'Licence Ouverte 2.0';
const minimumCommuneCount = Number(process.env.GEOGRAPHIC_MINIMUM_COMMUNES ?? '1000');
const publicationDate =
  process.env.GEOGRAPHIC_PUBLICATION_DATE ?? new Date().toISOString().slice(0, 10);
// Optional: official EPCI membership export (CSV) or an already-normalized JSON snapshot.
const epciPath = process.env.GEOGRAPHIC_EPCI_PATH;
// Official "liste des groupements" export: authoritative identity and legal nature.
const epciGroupementsPath = process.env.GEOGRAPHIC_EPCI_GROUPEMENTS_PATH;

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === '') {
  console.error('DATABASE_URL is missing. Define it in .env or .env.local.');
  process.exit(1);
}

console.log(`Geographic reference refresh: ${communesPath} (publication date ${publicationDate})`);
console.log(
  `EPCI reference: ${epciGroupementsPath ?? epciPath ?? 'derived from the commune dataset'}`,
);

const prisma = createPostgresClient(process.env.DATABASE_URL);
try {
  const result = await refreshGeographicReference(
    {
      communesPath,
      source,
      publicationDate,
      license,
      minimumCommuneCount,
      ...(epciPath === undefined || epciPath.trim() === '' ? {} : { epciPath }),
      ...(epciGroupementsPath === undefined || epciGroupementsPath.trim() === ''
        ? {}
        : { epciGroupementsPath }),
    },
    new PostgresGeographicReferenceWriter(prisma),
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'rejected' ? 1 : 0;
} finally {
  await prisma.$disconnect();
}
