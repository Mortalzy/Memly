import { pino } from 'pino';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@memly/database';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';

const config = loadConfig(process.env);
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const db = createDatabase(config.DATABASE_URL);
await db.$connect();
const webDirectory =
  config.NODE_ENV === 'production'
    ? fileURLToPath(new URL('../../../dist/', import.meta.url))
    : undefined;
const { app } = createApp(db, config, logger, webDirectory);
const server = app.listen(config.PORT, config.HOST, () =>
  logger.info({ port: config.PORT }, 'Memly API started'),
);
let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10000);
  timeout.unref();
  server.close(async () => {
    await db.$disconnect();
    clearTimeout(timeout);
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
