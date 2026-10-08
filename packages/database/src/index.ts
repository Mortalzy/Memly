import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/index.js';

export { Prisma } from '../generated/index.js';
export type { PrismaClient } from '../generated/index.js';

export function createDatabase(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 10 }) });
}
