import { PrismaClient } from '@prisma/client';

export function createPostgresClient(url = process.env.DATABASE_URL): PrismaClient {
  if (url === undefined || url.trim() === '') {
    throw new Error('DATABASE_URL is required');
  }
  return new PrismaClient({ datasources: { db: { url } } });
}

export async function checkPostgresHealth(client: PrismaClient): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}

export async function closePostgres(client: PrismaClient): Promise<void> {
  await client.$disconnect();
}
