import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@memly/database';
import { loadConfig } from '../apps/api/dist/config.js';
import { createMailTransport } from '../apps/api/dist/modules/auth/mail.js';
import { createWebRouter } from '../apps/api/dist/http/web.js';

let db;
let mail;
let stage = 'настройки';
try {
  if (process.versions.node.split('.')[0] !== '24') throw new Error('Node.js 24 required');
  const config = loadConfig(process.env);
  if (config.NODE_ENV !== 'production') throw new Error('Production required');
  if (process.env.VITE_DEMO_MODE === 'true') throw new Error('Demo mode enabled');
  createWebRouter(fileURLToPath(new URL('../dist/', import.meta.url)));
  console.log('OK: production-настройки и файлы сборки');

  stage = 'PostgreSQL и миграции';
  db = createDatabase(config.DATABASE_URL);
  await db.$queryRawUnsafe('SELECT 1');
  const migrations = await db.$queryRawUnsafe(
    'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
  );
  const expected = await readdir(
    new URL('../packages/database/prisma/migrations/', import.meta.url),
    {
      withFileTypes: true,
    },
  );
  if (
    migrations.some((row) => !row.finished_at && !row.rolled_back_at) ||
    expected
      .filter((entry) => entry.isDirectory())
      .some(
        (entry) =>
          !migrations.some(
            (row) => row.migration_name === entry.name && row.finished_at && !row.rolled_back_at,
          ),
      )
  )
    throw new Error('Pending or failed migrations');
  console.log('OK: PostgreSQL доступен, все миграции применены');

  stage = 'SMTP';
  mail = createMailTransport(config);
  await mail.verify();
  console.log('OK: SMTP соединение и авторизация (письмо не отправлялось)');
  console.log('После запуска проверьте HTTPS, регистрацию и доставку письма через свой домен.');
} catch {
  console.error(
    'Проверка не пройдена: ' + stage + '. Проверьте .env, сборку и доступность сервисов.',
  );
  process.exitCode = 1;
} finally {
  mail?.close();
  if (db) await db.$disconnect();
}
