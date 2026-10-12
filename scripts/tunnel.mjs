import { spawn } from 'node:child_process';

const url = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost');
if (
  process.env.NODE_ENV !== 'production' ||
  url.protocol !== 'https:' ||
  url.pathname !== '/' ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
) {
  throw new Error('Настройте NODE_ENV=production и BETTER_AUTH_URL=https://ваш-адрес-ngrok');
}
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный PORT');
const child = spawn('ngrok', ['http', `http://127.0.0.1:${port}`, '--url', url.origin], {
  stdio: 'inherit',
  shell: false,
});
child.on('error', () => {
  console.error('Не удалось запустить ngrok. Проверьте установку: ngrok version');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
