import { resolve } from 'node:path';

import { config } from 'dotenv';

// Vitest no longer copies `.env` into `process.env`, so the integration suite would only
// see DATABASE_URL when the shell exported it. Load the same files the runtime and the
// Prisma scripts read, without overriding a value the environment already provides.
config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
config({ path: resolve(process.cwd(), '.env.local'), override: true, quiet: true });
