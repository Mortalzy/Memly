import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const url = new URL(process.env.DATABASE_URL ?? '');
if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Укажите DATABASE_URL');
const directory = fileURLToPath(new URL('../backups/', import.meta.url));
await mkdir(directory, { recursive: true });
const path = join(directory, `memly-${new Date().toISOString().replaceAll(':', '-')}.dump`);
const child = spawn(
  process.env.PG_DUMP_PATH || 'pg_dump',
  ['--format=custom', '--no-password', '--file', path],
  {
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: false,
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
    },
  },
);
// Do not echo pg_dump diagnostics: they can include connection details.
child.stderr.resume();
const code = await new Promise((resolve) => {
  child.on('error', () => resolve(1));
  child.on('exit', (exitCode) => resolve(exitCode ?? 1));
});
if (code !== 0) {
  await rm(path, { force: true });
  console.error(
    'Копия не создана. Проверьте БД и PG_DUMP_PATH (pg_dump той же версии, что PostgreSQL).',
  );
  process.exitCode = 1;
} else {
  console.log(`Резервная копия создана: ${path}`);
}
