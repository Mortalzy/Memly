import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { pino } from 'pino';
import { createDatabase } from '@memly/database';
import { loadConfig } from '../../apps/api/dist/config.js';
import { createApp } from '../../apps/api/dist/app.js';

test(
  'built production server serves React, protects API, issues secure sessions and stops cleanly',
  {
    skip: !process.env.TEST_DATABASE_URL,
    timeout: 30000,
  },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL;
    assert.equal(new URL(url).pathname, '/memly_test');
    const db = createDatabase(url);
    const email = randomUUID() + '@hosting.memly.test';
    const password = 'Hosting-test-password-123';
    const origin = 'https://memly.test';
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      BETTER_AUTH_SECRET: 'hosting-test-secret-at-least-32-characters',
      BETTER_AUTH_URL: origin,
      TRUSTED_ORIGINS: origin,
    });
    const { app } = createApp(db, config, pino({ level: 'silent' }));
    t.after(async () => {
      await db.user.deleteMany({ where: { email } });
      await db.$disconnect();
    });
    await db.rateLimit.deleteMany();
    await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', origin)
      .send({ name: 'Hosting Test', email, password })
      .expect(200);
    await db.user.update({ where: { email }, data: { emailVerified: true } });

    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
      cwd: new URL('../../', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(port),
        DATABASE_URL: url,
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: config.BETTER_AUTH_SECRET,
        TRUSTED_ORIGINS: origin,
        TRUST_PROXY: '1',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '465',
        SMTP_FROM: 'no-reply@memly.test',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        LOG_LEVEL: 'silent',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.resume();
    let diagnostics = '';
    child.stderr.on('data', (chunk) => {
      diagnostics += chunk;
    });
    const exit = once(child, 'exit');
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exit;
      }
    });
    const base = 'http://127.0.0.1:' + port;
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (child.exitCode !== null) assert.fail(diagnostics);
      try {
        if ((await fetch(base + '/api/ready')).ok) {
          ready = true;
          break;
        }
      } catch {
        /* The process may still be starting. */
      }
      await delay(100);
    }
    assert.ok(ready, 'Production process failed to become ready: ' + diagnostics);
    const page = await request(base).get('/').expect(200).expect('Content-Type', /html/);
    assert.match(page.text, /<div id="root"><\/div>/);
    const asset = page.text.match(/src="\.\/([^"]+\.js)"/)[1];
    await request(base)
      .get('/' + asset)
      .expect(200);
    await request(base).get('/.env').expect(404);
    await request(base).get('/api/missing').expect(404);
    await request(base).get('/api/v1/me').expect(401);
    await request(base)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'https://evil.test')
      .send({ email, password })
      .expect(403);
    const signedIn = await request(base)
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ email, password })
      .expect(200);
    assert.match(signedIn.headers['set-cookie'].join(';'), /Secure/);
    assert.match(signedIn.headers['set-cookie'].join(';'), /HttpOnly/);
    const cookie = signedIn.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
    const me = await request(base).get('/api/v1/me').set('Cookie', cookie).expect(200);
    assert.equal(me.body.email, email);
    child.kill('SIGTERM');
    assert.deepEqual(await exit, [0, null]);
  },
);
