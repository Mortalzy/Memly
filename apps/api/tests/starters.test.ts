import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { pino } from 'pino';
import { createDatabase } from '@memly/database';
import { deckInputSchema, type DeckDto } from '@memly/contracts';
import { normalizeAnswer } from '@memly/study-engine';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { starterDecks } from '../src/modules/starters/catalog.ts';

test('starter material has complete, distinct pairs suitable for written and choice questions', () => {
  assert.equal(starterDecks.length, 10);
  assert.equal(new Set(starterDecks.map((item) => item.key)).size, 10);
  for (const starter of starterDecks) {
    const result = deckInputSchema.parse({
      title: starter.title,
      description: starter.description,
      icon: starter.icon,
      cards: starter.cards,
    });
    assert.equal(result.cards.length, 40, starter.key);
    for (const field of ['term', 'definition'] as const) {
      assert.equal(
        new Set(starter.cards.map((card) => normalizeAnswer(card[field]))).size,
        40,
        `${starter.key}: duplicate ${field}`,
      );
      assert.ok(starter.cards.every((card) => card[field] === card[field].trim()));
    }
    assert.ok(
      starter.cards.every((card) => /[a-z]/i.test(card.term) && /[а-яё]/i.test(card.definition)),
    );
  }
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test('starter catalog and private copies with PostgreSQL', { skip: !databaseUrl }, async (t) => {
  assert.ok(databaseUrl);
  assert.equal(new URL(databaseUrl).pathname, '/memly_test');
  const db = createDatabase(databaseUrl);
  const { app } = createApp(
    db,
    loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: 'http://memly.test',
      BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
      TRUSTED_ORIGINS: 'http://memly.test',
    }),
    pino({ level: 'silent' }),
  );
  const alice = request.agent(app);
  const bob = request.agent(app);
  const suffix = `${randomUUID()}@memly.test`;
  const mutate = (
    agent: typeof alice,
    method: 'post' | 'put' | 'delete',
    path: string,
    body: object = {},
  ) => agent[method](path).set('Origin', 'http://memly.test').send(body);
  t.after(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: suffix } } });
    await db.$disconnect();
  });
  for (const [agent, name] of [
    [alice, 'Alice'],
    [bob, 'Bob'],
  ] as const)
    await mutate(agent, 'post', '/api/auth/sign-up/email', {
      name,
      email: `starter-${name}-${suffix}`,
      password: 'A-long-password-123',
    }).expect(200);
  const userId = (await alice.get('/api/v1/me')).body.id;
  const path = (key: string) => `/api/v1/starter-decks/${key}`;
  const first = starterDecks[0];
  let copy: DeckDto;

  await t.test(
    'catalog is available without seed data, respects auth/origin, and validates keys',
    async () => {
      await request(app).get('/api/v1/starter-decks').expect(401);
      await request(app)
        .post(`${path(first.key)}/add`)
        .set('Origin', 'http://memly.test')
        .send({})
        .expect(401);
      const list = (await alice.get('/api/v1/starter-decks').expect(200)).body;
      assert.equal(list.length, 10);
      assert.ok(
        list.every(
          (item: { count: number; addedDeckId: null; cards?: unknown }) =>
            item.count === 40 && item.addedDeckId === null && !('cards' in item),
        ),
      );
      assert.equal(await db.deck.count({ where: { ownerId: userId } }), 0);
      const preview = (await alice.get(path(first.key)).expect(200)).body;
      assert.deepEqual(preview.cards, first.cards);
      await alice.get(path('not-a-template')).expect(404);
      await alice.get(path('BAD_KEY')).expect(400);
      await alice
        .post(`${path(first.key)}/add`)
        .set('Origin', 'https://evil.test')
        .send({})
        .expect(403);
      await mutate(alice, 'post', `${path(first.key)}/add`, { ownerId: 'attacker' }).expect(400);
    },
  );
  await t.test(
    'adding creates an atomic private editable copy and replay preserves it',
    async () => {
      copy = (await mutate(alice, 'post', `${path(first.key)}/add`).expect(200)).body;
      assert.equal(copy.ownerId, userId);
      assert.equal(copy.visibility, 'private');
      assert.equal(copy.count, 40);
      assert.equal(copy.progress, 0);
      assert.deepEqual(
        copy.cards.map(({ term, definition }) => ({ term, definition })),
        first.cards,
      );
      assert.equal(await db.cardVersion.count({ where: { card: { deckId: copy.id } } }), 40);
      const replay = (await mutate(alice, 'post', `${path(first.key)}/add`).expect(200)).body;
      assert.equal(replay.id, copy.id);
      assert.deepEqual(replay.cards, copy.cards);
      assert.equal(await db.deck.count({ where: { ownerId: userId, starterKey: first.key } }), 1);
      assert.equal((await alice.get(path(first.key))).body.addedDeckId, copy.id);
      assert.equal((await bob.get(path(first.key))).body.addedDeckId, null);
      await bob.get(`/api/v1/decks/${copy.id}`).expect(404);
    },
  );
  await t.test('editing and studying a copy never changes the source or another user', async () => {
    const other: DeckDto = (await mutate(bob, 'post', `${path(first.key)}/add`).expect(200)).body;
    assert.notEqual(other.id, copy.id);
    assert.notEqual(other.cards[0].id, copy.cards[0].id);
    copy = (
      await mutate(alice, 'put', `/api/v1/decks/${copy.id}`, {
        title: 'Мои глаголы',
        revision: copy.revision,
        cards: copy.cards.map((card, index) => ({
          id: card.id,
          term: index ? card.term : 'exist',
          definition: card.definition,
        })),
      }).expect(200)
    ).body;
    const replay = (await mutate(alice, 'post', `${path(first.key)}/add`).expect(200)).body;
    assert.equal(replay.title, 'Мои глаголы');
    assert.equal(replay.cards[0].term, 'exist');
    await mutate(alice, 'post', '/api/v1/study/reviews', {
      eventId: randomUUID(),
      cardId: copy.cards[0].id,
      cardRevision: copy.cards[0].revision,
      known: true,
    }).expect(204);
    assert.equal((await bob.get(`/api/v1/decks/${other.id}`)).body.progress, 0);
    assert.deepEqual((await alice.get(path(first.key))).body.cards, first.cards);
    for (const mode of ['cards', 'learn', 'test', 'match']) {
      const session = (
        await mutate(alice, 'post', '/api/v1/study/sessions', {
          requestId: randomUUID(),
          deckId: copy.id,
          mode,
          options: { count: 2, direction: 'reverse' },
        }).expect(201)
      ).body;
      assert.equal(session.mode, mode);
      assert.equal(session.status, 'active');
    }
  });
  await t.test(
    'every template imports; concurrent adds choose one copy; deletion allows re-adding',
    async () => {
      const second = starterDecks[1];
      const concurrent = await Promise.all([
        mutate(alice, 'post', `${path(second.key)}/add`),
        mutate(alice, 'post', `${path(second.key)}/add`),
      ]);
      assert.ok(
        concurrent.every((response) => response.status === 200),
        JSON.stringify(
          concurrent.map((response) => ({ status: response.status, error: response.body.error })),
        ),
      );
      assert.equal(concurrent[0].body.id, concurrent[1].body.id);
      for (const starter of starterDecks.slice(2)) {
        const response = await mutate(alice, 'post', `${path(starter.key)}/add`).expect(200);
        assert.equal(response.body.count, 40);
      }
      assert.equal(await db.deck.count({ where: { ownerId: userId } }), 10);
      await mutate(alice, 'delete', `/api/v1/decks/${copy.id}`, { revision: copy.revision }).expect(
        204,
      );
      assert.equal((await alice.get(path(first.key))).body.addedDeckId, null);
      const fresh = (await mutate(alice, 'post', `${path(first.key)}/add`).expect(200)).body;
      assert.notEqual(fresh.id, copy.id);
      assert.equal(fresh.title, first.title);
      assert.equal(fresh.cards[0].term, first.cards[0].term);
      assert.equal(fresh.progress, 0);
    },
  );
});
