import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://memly:password@127.0.0.1:5432/memly',
  BETTER_AUTH_URL: 'https://memly.example',
  BETTER_AUTH_SECRET: 'a-production-secret-with-at-least-32-characters',
  TRUSTED_ORIGINS: 'https://memly.example',
  SMTP_HOST: 'smtp.example',
  SMTP_FROM: 'Memly <no-reply@memly.example>',
  SMTP_PORT: '465',
};

test('production accepts a single HTTPS origin and configured mail', () => {
  assert.equal(loadConfig(production).smtpEnabled, true);
  assert.deepEqual(
    loadConfig({ ...production, BETTER_AUTH_URL: 'https://memly.example/' }).origins,
    ['https://memly.example'],
  );
});

test('misconfigured production addresses and incomplete mail fail before listening', () => {
  for (const overrides of [
    { DATABASE_URL: 'postgres-anything' },
    { DATABASE_URL: 'https://memly.example/db' },
    { DATABASE_URL: 'postgresql://127.0.0.1' },
    { BETTER_AUTH_URL: 'https://another.example' },
    { BETTER_AUTH_URL: 'https://memly.example/api/auth' },
    { BETTER_AUTH_URL: 'https://user:password@memly.example' },
    { BETTER_AUTH_URL: 'https://memly.example/?query=1' },
    { TRUSTED_ORIGINS: 'https://memly.example/path' },
    { BETTER_AUTH_URL: 'http://memly.example', TRUSTED_ORIGINS: 'http://memly.example' },
    { SMTP_HOST: '' },
    { SMTP_FROM: '' },
    { SMTP_USER: 'user' },
    { SMTP_PORT: '65536' },
    { BETTER_AUTH_SECRET: 'short' },
  ])
    assert.throws(() => loadConfig({ ...production, ...overrides }));
});
