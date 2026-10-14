import { spawn } from 'node:child_process';
import { loadConfig } from '../apps/api/src/config.ts';

try {
  loadConfig({ ...process.env, NODE_ENV: 'production' });
} catch {
  console.error('Проверьте .env: production требует PostgreSQL URL, секрет, HTTPS origins и SMTP.');
  process.exit(1);
}

// Override a demo flag from either the shell or Vite env files.
const child = spawn(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, NODE_ENV: 'production', VITE_DEMO_MODE: 'false' },
});
child.on('error', () => {
  console.error('Не удалось запустить сборку.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
