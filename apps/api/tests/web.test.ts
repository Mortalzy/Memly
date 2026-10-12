import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createWebRouter } from '../src/http/web.ts';

test('built frontend is served without exposing hidden files or masking API and asset errors', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'memly-web-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'index.html'), '<html>Memly</html>');
  await writeFile(join(directory, '.env'), 'secret');
  await mkdir(join(directory, 'api'));
  await writeFile(join(directory, 'api', 'private.txt'), 'must not be served');
  const app = express();
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(createWebRouter(directory));
  await request(app).get('/').expect(200).expect('Content-Type', /html/);
  await request(app).get('/api/health').expect(200, { status: 'ok' });
  for (const path of ['/.env', '/api/private.txt', '/api/missing', '/assets/missing.js']) {
    await request(app).get(path).expect(404);
  }
  await request(app).post('/').expect(404);
});

test('missing build fails before exposing an incomplete app', () => {
  assert.throws(() => createWebRouter(join(tmpdir(), 'memly-absent-build')));
});
