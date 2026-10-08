import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { pino } from 'pino';
import { createDatabase } from '@memly/database';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('API integration with PostgreSQL', { skip: !databaseUrl }, async (t) => {
  assert.ok(databaseUrl);
  assert.equal(new URL(databaseUrl).pathname, '/memly_test', 'Use a dedicated memly_test database');
  const db = createDatabase(databaseUrl);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: 'http://memly.test',
    BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
    TRUSTED_ORIGINS: 'http://memly.test',
  });
  const { app } = createApp(db, config, pino({ level: 'silent' }));
  const alice = request.agent(app);
  const bob = request.agent(app);
  const suffix = `${randomUUID()}@memly.test`;
  t.after(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: suffix } } });
    await db.$disconnect();
  });
  const mutate = (
    agent: typeof alice,
    method: 'post' | 'put' | 'delete' | 'patch',
    path: string,
    body: object,
  ) => agent[method](path).set('Origin', 'http://memly.test').send(body);
  const input = {
    title: 'English',
    cards: [
      { term: 'One', definition: 'Один' },
      { term: 'Two', definition: 'Два' },
    ],
  };
  let deck: Awaited<ReturnType<typeof db.deck.findUniqueOrThrow>> & {
    cards: { id: string; term: string; definition: string; revision: number }[];
  };
  let folderId: string;

  await t.test('health, readiness and authentication boundary', async () => {
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/ready').expect(200);
    const response = await request(app).get('/api/v1/decks').expect(401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
    assert.ok(response.body.error.requestId);
  });
  await t.test('registration, session and secret-free profile DTO', async () => {
    for (const [agent, name] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
    ] as const) {
      const response = await mutate(agent, 'post', '/api/auth/sign-up/email', {
        name,
        email: `${name.toLowerCase()}-${suffix}`,
        password: 'A-long-password-123',
      }).expect(200);
      assert.match(String(response.headers['set-cookie']), /HttpOnly/i);
    }
    const response = await alice.get('/api/v1/me').expect(200);
    assert.deepEqual(Object.keys(response.body).sort(), ['email', 'id', 'name']);
    const account = await db.account.findFirstOrThrow({ where: { userId: response.body.id } });
    assert.notEqual(account.password, 'A-long-password-123');
  });
  await t.test('rejects untrusted origins and invalid input', async () => {
    await alice.post('/api/v1/decks').set('Origin', 'https://evil.test').send(input).expect(403);
    await alice.post('/api/v1/decks').send(input).expect(403);
    await mutate(alice, 'post', '/api/v1/decks', { title: 'Invalid', cards: [] }).expect(400);
    await mutate(alice, 'post', '/api/v1/decks', { ...input, ownerId: 'attacker' }).expect(400);
    await alice.get('/api/v1/decks/not-a-uuid').expect(400);
  });
  await t.test('persists folders, decks and private defaults', async () => {
    const folder = await mutate(alice, 'post', '/api/v1/folders', { title: 'Languages' }).expect(
      201,
    );
    folderId = folder.body.id;
    const response = await mutate(alice, 'post', '/api/v1/decks', { ...input, folderId }).expect(
      201,
    );
    deck = response.body;
    assert.equal(response.body.visibility, 'private');
    assert.equal(response.body.count, 2);
    assert.equal(response.body.folder, folderId);
    const restored = await alice.get(`/api/v1/decks/${deck.id}`).expect(200);
    assert.equal(restored.body.cards[0].term, 'One');
  });
  await t.test('another user cannot read or mutate private data', async () => {
    await bob.get(`/api/v1/decks/${deck.id}`).expect(404);
    await mutate(bob, 'put', `/api/v1/decks/${deck.id}`, { ...input, revision: 1 }).expect(404);
    await mutate(bob, 'delete', `/api/v1/decks/${deck.id}`, { revision: 1 }).expect(404);
    await mutate(bob, 'post', '/api/v1/decks', { ...input, folderId }).expect(404);
    await mutate(bob, 'delete', `/api/v1/folders/${folderId}`, { revision: 1 }).expect(404);
    const catalog = await bob.get('/api/v1/decks?scope=public').expect(200);
    assert.ok(!catalog.body.items.some((item: { id: string }) => item.id === deck.id));
  });
  await t.test('favorites are idempotent and personal', async () => {
    await mutate(alice, 'put', `/api/v1/decks/${deck.id}/favorite`, { favorite: true }).expect(204);
    await mutate(alice, 'put', `/api/v1/decks/${deck.id}/favorite`, { favorite: true }).expect(204);
    assert.equal((await alice.get(`/api/v1/decks/${deck.id}`)).body.favorite, true);
  });
  await t.test('review delivery is idempotent and checks card revisions', async () => {
    const review = {
      eventId: randomUUID(),
      cardId: deck.cards[0].id,
      cardRevision: 1,
      known: true,
    };
    await mutate(alice, 'post', '/api/v1/study/reviews', review).expect(204);
    await mutate(alice, 'post', '/api/v1/study/reviews', review).expect(204);
    await mutate(alice, 'post', '/api/v1/study/reviews', { ...review, known: false }).expect(409);
    await mutate(bob, 'post', '/api/v1/study/reviews', { ...review, eventId: randomUUID() }).expect(
      404,
    );
    const stats = await alice.get('/api/v1/study/progress').expect(200);
    assert.equal(stats.body.reviewed, 1);
    assert.equal(stats.body.known, 1);
    assert.equal((await alice.get(`/api/v1/decks/${deck.id}`)).body.progress, 50);
  });
  await t.test('editing retains IDs, versions content and rejects stale saves', async () => {
    const editedCards = deck.cards.map((card, position) => ({
      id: card.id,
      term: position ? card.term : 'First',
      definition: card.definition,
    }));
    const response = await mutate(alice, 'put', `/api/v1/decks/${deck.id}`, {
      ...input,
      folderId,
      cards: editedCards,
      revision: 1,
      visibility: 'public',
    }).expect(200);
    assert.equal(response.body.revision, 2);
    assert.equal(response.body.cards[0].id, deck.cards[0].id);
    assert.equal(response.body.cards[0].revision, 2);
    assert.equal(response.body.progress, 0);
    assert.equal(await db.cardVersion.count({ where: { cardId: deck.cards[0].id } }), 2);
    await mutate(alice, 'put', `/api/v1/decks/${deck.id}`, { ...input, revision: 1 }).expect(409);
    await mutate(alice, 'post', '/api/v1/study/reviews', {
      eventId: randomUUID(),
      cardId: deck.cards[0].id,
      cardRevision: 1,
      known: true,
    }).expect(409);
    deck = response.body;
  });
  await t.test('public read does not allow edits and never exposes owner folders', async () => {
    const response = await bob.get(`/api/v1/decks/${deck.id}`).expect(200);
    assert.equal(response.body.folder, '');
    assert.equal(response.body.favorite, false);
    await mutate(bob, 'put', `/api/v1/decks/${deck.id}`, { ...input, revision: 2 }).expect(404);
    const catalog = await bob.get('/api/v1/decks?scope=public&q=English&limit=1').expect(200);
    assert.ok(catalog.body.items.some((item: { id: string }) => item.id === deck.id));
    assert.deepEqual(catalog.body.items[0].cards, []);
  });
  await t.test('card changes are atomic and cross-deck IDs are rejected', async () => {
    const other = await mutate(alice, 'post', '/api/v1/decks', input).expect(201);
    await mutate(alice, 'put', `/api/v1/decks/${deck.id}`, {
      ...input,
      revision: 2,
      cards: [{ id: other.body.cards[0].id, term: 'bad', definition: 'bad' }, input.cards[1]],
    }).expect(400);
    assert.equal((await alice.get(`/api/v1/decks/${deck.id}`)).body.revision, 2);
    await mutate(alice, 'delete', `/api/v1/decks/${other.body.id}`, { revision: 1 }).expect(204);
  });
  await t.test('profile persists and deleting a folder preserves its decks', async () => {
    await mutate(alice, 'patch', '/api/v1/me', { name: 'Alice Updated' }).expect(200);
    assert.equal((await alice.get('/api/v1/me')).body.name, 'Alice Updated');
    await mutate(alice, 'delete', `/api/v1/folders/${folderId}`, { revision: 1 }).expect(204);
    assert.equal((await alice.get(`/api/v1/decks/${deck.id}`)).body.folder, '');
  });
  await t.test('deletion cascades card data and logout revokes the session', async () => {
    await mutate(alice, 'delete', `/api/v1/decks/${deck.id}`, { revision: 1 }).expect(409);
    await mutate(alice, 'delete', `/api/v1/decks/${deck.id}`, { revision: 2 }).expect(204);
    await alice.get(`/api/v1/decks/${deck.id}`).expect(404);
    assert.equal(await db.card.count({ where: { deckId: deck.id } }), 0);
    const before = await alice.get('/api/v1/me');
    const cookies = before.request.getHeader('Cookie');
    await mutate(alice, 'post', '/api/auth/sign-out', {}).expect(200);
    await alice.get('/api/v1/me').expect(401);
    if (typeof cookies === 'string')
      await request(app).get('/api/v1/me').set('Cookie', cookies).expect(401);
    await mutate(alice, 'post', '/api/auth/sign-in/email', {
      email: `alice-${suffix}`,
      password: 'A-long-password-123',
    }).expect(200);
    await alice.get('/api/v1/me').expect(200);
  });
});

test('production configuration requires strong secrets, HTTPS and mail', () => {
  assert.throws(() =>
    loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/memly',
      BETTER_AUTH_URL: 'http://localhost',
      BETTER_AUTH_SECRET: 'short',
      TRUSTED_ORIGINS: 'http://localhost',
    }),
  );
});
