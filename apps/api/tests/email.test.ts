import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SMTPServer } from 'smtp-server';
import request from 'supertest';
import { pino } from 'pino';
import { createDatabase } from '@memly/database';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

test(
  'email verification and password reset revoke old sessions',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL!;
    assert.equal(new URL(url).pathname, '/memly_test');
    const messages: string[] = [];
    const smtp = new SMTPServer({
      disabledCommands: ['AUTH', 'STARTTLS'],
      authOptional: true,
      onData(stream, _session, callback) {
        let message = '';
        stream.on('data', (chunk) => {
          message += chunk.toString();
        });
        stream.on('end', () => {
          messages.push(message);
          callback();
        });
      },
    });
    await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
    const address = smtp.server.address();
    assert.ok(address && typeof address !== 'string');
    const db = createDatabase(url);
    const email = `${randomUUID()}@mail.memly.test`;
    t.after(async () => {
      await db.user.deleteMany({ where: { email } });
      await db.$disconnect();
      await new Promise<void>((resolve) => smtp.close(resolve));
    });
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      BETTER_AUTH_URL: 'http://memly.test',
      BETTER_AUTH_SECRET: 'email-test-secret-at-least-32-characters',
      TRUSTED_ORIGINS: 'http://memly.test',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(address.port),
      SMTP_FROM: 'Memly <no-reply@memly.test>',
      TRUST_PROXY: '1',
    });
    const { app } = createApp(db, config, pino({ level: 'silent' }));
    const agent = request.agent(app);
    const post = (path: string, data: object) =>
      agent
        .post(path)
        .set('Origin', 'http://memly.test')
        .set('X-Forwarded-For', '203.0.113.2')
        .send(data);
    const link = () => {
      const raw = messages.at(-1)!;
      const text = /Content-Transfer-Encoding: base64/i.test(raw)
        ? Buffer.from(
            raw
              .split(/\r?\n\r?\n/)
              .slice(1)
              .join(''),
            'base64',
          ).toString('utf8')
        : raw;
      const decoded = text
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      const match = decoded.match(/http:\/\/memly\.test\/[^\s]+/);
      assert.ok(match, 'Email must contain a link');
      return new URL(match[0]);
    };
    await post('/api/auth/sign-up/email', {
      name: 'Mail User',
      email,
      password: 'Initial-password-123',
      callbackURL: 'http://memly.test/',
    }).expect(200);
    await agent.get('/api/v1/me').expect(401);
    await post('/api/auth/sign-in/email', { email, password: 'Initial-password-123' }).expect(403);
    const verification = link();
    await agent.get(verification.pathname + verification.search).expect(302);
    await agent.get('/api/v1/me').expect(200);
    const originalCookies = (await db.session.findMany({ where: { user: { email } } })).map(
      (session) => session.id,
    );
    await post('/api/auth/request-password-reset', {
      email,
      redirectTo: 'http://memly.test/?reset=1',
    }).expect(200);
    const reset = link();
    // The server endpoint validates the token before redirecting to the web reset form.
    const redirect = await agent.get(reset.pathname + reset.search).expect(302);
    const resetToken = new URL(redirect.headers.location).searchParams.get('token');
    assert.ok(resetToken);
    await post('/api/auth/reset-password', {
      token: resetToken,
      newPassword: 'Changed-password-456',
    }).expect(200);
    assert.equal(await db.session.count({ where: { id: { in: originalCookies } } }), 0);
    await agent.get('/api/v1/me').expect(401);
    await post('/api/auth/sign-in/email', { email, password: 'Initial-password-123' }).expect(401);
    await post('/api/auth/sign-in/email', { email, password: 'Changed-password-456' }).expect(200);
    await post('/api/auth/reset-password', {
      token: resetToken,
      newPassword: 'Another-password-789',
    }).expect(400);
  },
);
