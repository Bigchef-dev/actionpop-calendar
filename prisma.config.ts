import { defineConfig } from 'prisma/config';

// Prisma 7 removed `url` from the datasource block: migrations and the CLI read the
// connection string from this file, while the runtime passes a driver adapter to the
// client. Keeping it here means one place still decides which database is targeted.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
