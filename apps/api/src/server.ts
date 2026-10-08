import { pino } from 'pino';
import { createDatabase } from '@memly/database';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';

const config = loadConfig(process.env);
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const db = createDatabase(config.DATABASE_URL);
await db.$connect();
const { app } = createApp(db, config, logger);
const server = app.listen(config.PORT, '0.0.0.0', () =>
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
