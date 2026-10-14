import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/index.js';

export { Prisma } from '../generated/index.js';
export type { PrismaClient } from '../generated/index.js';

export function createDatabase(url: string): PrismaClient {
  // The adapter serializes Date values without an offset and expects UTC on every connection.
  // Fix the session timezone even when the VPS/database default or URL options differ.
  const connection = new URL(url);
  connection.searchParams.set(
    'options',
    [connection.searchParams.get('options'), '-c timezone=UTC'].filter(Boolean).join(' '),
  );
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: connection.toString(),
      max: 10,
      connectionTimeoutMillis: 10000,
    }),
  });
}
