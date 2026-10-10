import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { pino } from 'pino';
import { createDatabase } from '@memly/database';
import type { StudyAction, StudySessionDto } from '@memly/contracts';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test(
  'scanword persistence, authorization, idempotency and completed-game activity with PostgreSQL',
  { skip: !databaseUrl },
  async (t) => {
    assert.ok(databaseUrl);
    assert.equal(new URL(databaseUrl).pathname, '/memly_test');
    const db = createDatabase(databaseUrl);
    const { app } = createApp(
      db,
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_URL: 'http://memly.test',
        BETTER_AUTH_SECRET: 'scanword-tests-secret-more-than-32-characters',
        TRUSTED_ORIGINS: 'http://memly.test',
      }),
      pino({ level: 'silent' }),
    );
    const alice = request.agent(app),
      bob = request.agent(app);
    const suffix = `${randomUUID()}@memly.test`;
    t.after(async () => {
      await db.user.deleteMany({ where: { email: { endsWith: suffix } } });
      await db.$disconnect();
    });
    const post = (agent: typeof alice, path: string, input: object) =>
      agent.post(`/api/v1${path}`).set('Origin', 'http://memly.test').send(input);
    for (const [agent, name] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
    ] as const)
      await agent
        .post('/api/auth/sign-up/email')
        .set('Origin', 'http://memly.test')
        .send({ name, email: `${name}-${suffix}`, password: 'Long-scanword-password-123' })
        .expect(200);
    const userId = (await alice.get('/api/v1/me')).body.id as string;
    const terms = [
      'APPLE',
      'PEAR',
      'MILK',
      'BREAD',
      'LEMON',
      'TEA',
      'SALT',
      'COFFEE',
      'BUTTER',
      'WATER',
      'ORANGE',
      'CHERRY',
      'МОЛОКО',
      'ЁЖ',
      'НЕ ПОДХОДИТ',
    ];
    const deck = (
      await post(alice, '/decks', {
        title: 'Scanword words',
        cards: terms.map((term, index) => ({ term, definition: `Подсказка ${index}` })),
      }).expect(201)
    ).body;
    const eligible = deck.cards.slice(0, -1) as { id: string; term: string }[];
    const input = {
      requestId: randomUUID(),
      deckId: deck.id,
      mode: 'scanword',
      cardIds: eligible.map((card) => card.id),
      options: {
        count: eligible.length,
        direction: 'reverse',
        answerType: 'written',
        shuffle: false,
        filter: 'all',
      },
    };
    let session = (await post(alice, '/study/sessions', input).expect(201)).body as StudySessionDto;
    const act = async (action: StudyAction, eventId = randomUUID(), value = session) =>
      (
        await post(alice, `/study/sessions/${value.id}/events`, {
          eventId,
          revision: value.revision,
          action,
        }).expect(200)
      ).body as StudySessionDto;
    const activity = () =>
      alice.get('/api/v1/study/activity?days=7&mode=scanword&timeZone=Europe/Samara');
    assert.equal((await post(alice, '/study/sessions', input).expect(201)).body.id, session.id);
    await post(alice, '/study/sessions', {
      ...input,
      options: { ...input.options, shuffle: true },
    }).expect(409);
    await post(bob, '/study/sessions', { ...input, requestId: randomUUID() }).expect(404);
    await bob.get(`/api/v1/study/sessions/${session.id}`).expect(404);
    await post(bob, `/study/sessions/${session.id}/events`, {
      eventId: randomUUID(),
      revision: 1,
      action: { type: 'scanword-draft', round: 1, cells: [] },
    }).expect(404);
    await post(alice, '/study/sessions', {
      ...input,
      requestId: randomUUID(),
      cardIds: deck.cards.map((card: { id: string }) => card.id),
      options: { ...input.options, count: terms.length },
    }).expect(400);
    assert.equal(
      session.scanword!.words.some((word) => 'answer' in word),
      false,
    );
    assert.ok(session.scanword!.cells.every((cell) => !cell.value));
    assert.deepEqual(session.results, []);
    assert.equal((await activity().expect(200)).body.completed, 0);
    const first = session.scanword!.cells.find((cell) => cell.kind === 'letter')!;
    const draftAction: StudyAction = {
      type: 'scanword-draft',
      round: 1,
      cells: [{ key: first.key, value: 'z' }],
    };
    const draftId = randomUUID(),
      before = session;
    session = await act(draftAction, draftId);
    assert.equal((await act(draftAction, draftId, before)).revision, session.revision);
    assert.equal(
      (await alice.get(`/api/v1/study/sessions/${session.id}`)).body.scanword.cells.find(
        (cell: { key: string }) => cell.key === first.key,
      ).value,
      'Z',
    );
    assert.equal(await db.reviewEvent.count({ where: { userId } }), 0);
    await post(alice, `/study/sessions/${session.id}/events`, {
      eventId: randomUUID(),
      revision: 1,
      action: draftAction,
    }).expect(409);
    await post(alice, `/study/sessions/${session.id}/events`, {
      eventId: randomUUID(),
      revision: session.revision,
      action: { type: 'scanword-draft', round: 1, cells: [{ key: '1:100:100', value: 'X' }] },
    }).expect(400);
    const hintAction: StudyAction = {
      type: 'scanword-hint',
      round: 1,
      wordId: session.scanword!.words[0].id,
    };
    const hintId = randomUUID(),
      beforeHint = session;
    session = await act(hintAction, hintId);
    assert.equal((await act(hintAction, hintId, beforeHint)).summary.hints, 1);
    assert.equal(session.scanword!.cells.filter((cell) => cell.locked).length, 1);
    const restored = (
      await alice.get(`/api/v1/study/sessions/active?deckId=${deck.id}&mode=scanword`).expect(200)
    ).body;
    assert.equal(restored.id, session.id);
    assert.deepEqual(restored.scanword, session.scanword);
    while (session.status === 'active') {
      const board = session.scanword!;
      const cells = new Map<string, string>();
      for (const word of board.words) {
        const answer = eligible.find((card) => card.id === word.cardId)!.term;
        [...answer].forEach((value, index) => {
          const row = word.row + (word.direction === 'down' ? index : 0);
          const column = word.column + (word.direction === 'across' ? index : 0);
          const cell = board.cells.find((cell) => cell.row === row && cell.column === column)!;
          cells.set(cell.key, value);
        });
      }
      const action: StudyAction = {
        type: 'scanword-check',
        round: board.round,
        cells: [...cells].map(([key, value]) => ({ key, value })),
      };
      const eventId = randomUUID(),
        snapshot = session;
      session = await act(action, eventId);
      assert.equal((await act(action, eventId, snapshot)).revision, session.revision);
      assert.equal(
        (await activity().expect(200)).body.completed,
        session.status === 'completed' ? 1 : 0,
      );
      if (session.status === 'active')
        session = await act({ type: 'scanword-next', round: board.round });
    }
    assert.equal(session.summary.answered, eligible.length);
    assert.equal(session.summary.hints, 1);
    assert.ok(session.summary.score < 100);
    assert.equal(session.results.length, eligible.length);
    assert.equal(await db.reviewEvent.count({ where: { userId } }), eligible.length);
    const report = (await activity().expect(200)).body;
    assert.equal(report.todayByMode.scanword, 1);
    assert.equal(report.history[0].mode, 'scanword');
    await db.deck.update({ where: { id: deck.id }, data: { visibility: 'public' } });
    const other = (
      await post(bob, '/study/sessions', { ...input, requestId: randomUUID() }).expect(201)
    ).body;
    await db.deck.update({ where: { id: deck.id }, data: { visibility: 'private' } });
    await bob.get(`/api/v1/study/sessions/${other.id}`).expect(404);
    await post(bob, `/study/sessions/${other.id}/events`, {
      eventId: randomUUID(),
      revision: 1,
      action: { type: 'scanword-hint', round: 1, wordId: other.scanword.words[0].id },
    }).expect(404);
  },
);
