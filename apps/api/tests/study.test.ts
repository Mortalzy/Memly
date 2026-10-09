import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { pino } from 'pino';
import { createDatabase } from '@memly/database';
import type { StudyAction, StudySessionDto } from '@memly/contracts';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { calendarDate, shiftDate } from '../src/modules/study/activity.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;
test('server study sessions with PostgreSQL', { skip: !databaseUrl }, async (t) => {
  assert.ok(databaseUrl);
  assert.equal(new URL(databaseUrl).pathname, '/memly_test');
  const db = createDatabase(databaseUrl);
  const { app } = createApp(
    db,
    loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: 'http://memly.test',
      BETTER_AUTH_SECRET: 'study-tests-secret-more-than-32-characters',
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
      .send({ name, email: `${name}-${suffix}`, password: 'Long-password-study-123' })
      .expect(200);
  const userId = (await alice.get('/api/v1/me')).body.id as string;
  const deck = (
    await post(alice, '/decks', {
      title: 'Study words',
      cards: Array.from({ length: 7 }, (_, i) => ({ term: `Word${i}`, definition: `Перевод${i}` })),
    }).expect(201)
  ).body;
  const base = {
    deckId: deck.id as string,
    options: {
      count: 7,
      shuffle: false,
      direction: 'forward',
      answerType: 'written',
      filter: 'all',
    },
  };
  const start = async (mode: string, options = base.options) =>
    (
      await post(alice, '/study/sessions', {
        ...base,
        mode,
        options,
        requestId: randomUUID(),
      }).expect(201)
    ).body as StudySessionDto;
  const act = async (session: StudySessionDto, action: StudyAction, eventId = randomUUID()) =>
    (
      await post(alice, `/study/sessions/${session.id}/events`, {
        eventId,
        revision: session.revision,
        action,
      }).expect(200)
    ).body as StudySessionDto;
  await t.test('session ownership, private access, replay and revision conflicts', async () => {
    await post(bob, '/study/sessions', { ...base, mode: 'cards', requestId: randomUUID() }).expect(
      404,
    );
    const input = { ...base, mode: 'cards', requestId: randomUUID() };
    const a = (await post(alice, '/study/sessions', input).expect(201)).body as StudySessionDto;
    const replay = await post(alice, '/study/sessions', input).expect(201);
    assert.equal(replay.body.id, a.id);
    await post(alice, '/study/sessions', { ...input, mode: 'test' }).expect(409);
    await bob.get(`/api/v1/study/sessions/${a.id}`).expect(404);
    await post(bob, `/study/sessions/${a.id}/events`, {
      eventId: randomUUID(),
      revision: a.revision,
      action: { type: 'navigate', index: 0 },
    }).expect(404);
    const eventId = randomUUID();
    const action: StudyAction = { type: 'rate', questionId: a.current!.id, known: true };
    const reviews = await db.reviewEvent.count({ where: { userId } });
    const b = await act(a, action, eventId);
    assert.equal((await act(a, action, eventId)).revision, b.revision);
    assert.equal(await db.reviewEvent.count({ where: { userId } }), reviews + 1);
    await post(alice, `/study/sessions/${a.id}/events`, {
      eventId,
      revision: a.revision,
      action: { ...action, known: false },
    }).expect(409);
    await post(alice, `/study/sessions/${a.id}/events`, {
      eventId: randomUUID(),
      revision: a.revision,
      action: { type: 'navigate', index: 1 },
    }).expect(409);
    const restored = (await alice.get(`/api/v1/study/sessions/active?deckId=${deck.id}&mode=cards`))
      .body;
    assert.equal(restored.id, a.id);
    assert.equal(restored.summary.answered, 1);
    let current = b;
    while (current.status === 'active')
      current = await act(current, { type: 'rate', questionId: current.current!.id, known: false });
    assert.equal(current.summary.score, 14);
    assert.equal(current.summary.correct, 1);
  });
  await t.test('test draft restoration, hidden answers and server-calculated grade', async () => {
    let session = await start('test');
    assert.ok(session.questions.every((q) => !('expected' in q) && !('back' in q)));
    assert.deepEqual(session.results, []);
    const answers = session.questions.map((q, i) => ({
      questionId: q.id,
      value: i ? 'wrong' : ' перевод0 ',
    }));
    const before = await db.reviewEvent.count({ where: { userId } });
    session = await act(session, { type: 'test', finish: false, answers });
    assert.deepEqual(session.results, []);
    assert.equal(await db.reviewEvent.count({ where: { userId } }), before);
    const restored = await alice.get(`/api/v1/study/sessions/${session.id}`).expect(200);
    assert.deepEqual(restored.body.drafts, session.drafts);
    const input = {
      eventId: randomUUID(),
      revision: session.revision,
      action: { type: 'test', finish: true, answers },
    };
    session = (await post(alice, `/study/sessions/${session.id}/events`, input).expect(200)).body;
    assert.equal(session.summary.score, 14);
    assert.equal(session.summary.mistakes, 6);
    assert.equal(session.results[0].expected, 'Перевод0');
    await post(alice, `/study/sessions/${session.id}/events`, input).expect(200);
    assert.equal(await db.reviewEvent.count({ where: { userId } }), before + 7);
    await post(alice, `/study/sessions/${session.id}/events`, {
      ...input,
      eventId: randomUUID(),
      revision: session.revision,
      action: { type: 'test', finish: false, answers: [] },
    }).expect(400);
  });
  await t.test('learn repeats errors, reverses direction and resumes feedback', async () => {
    let session = await start('learn', { ...base.options, direction: 'reverse', count: 2 });
    session = await act(session, {
      type: 'answer',
      questionId: session.current!.id,
      value: 'Wrong',
    });
    assert.equal(session.feedback!.correct, false);
    assert.equal(
      (await alice.get(`/api/v1/study/sessions/${session.id}`)).body.feedback.expected,
      'Word0',
    );
    for (let i = 0; i < 10 && session.status === 'active'; i++) {
      if (session.feedback) session = await act(session, { type: 'next' });
      else
        session = await act(session, {
          type: 'answer',
          questionId: session.current!.id,
          value: session.current!.prompt.replace('Перевод', 'Word'),
        });
    }
    assert.equal(session.status, 'completed');
    assert.equal(session.summary.score, 50);
    assert.equal(session.summary.mastered, 2);
  });
  await t.test('match visits two rounds and stores elapsed time and personal record', async () => {
    let session = await start('match');
    session = await act(session, { type: 'pair', left: 'l-0-0', right: 'r-0-1' });
    assert.equal(session.summary.mistakes, 1);
    for (let i = 0; i < 7; i++)
      session = await act(session, {
        type: 'pair',
        left: `l-${Math.floor(i / 6)}-${i}`,
        right: `r-${Math.floor(i / 6)}-${i}`,
      });
    assert.equal(session.status, 'completed');
    assert.equal(session.summary.answered, 7);
    assert.ok(session.elapsedMs >= 0);
    assert.equal(session.bestMs, session.elapsedMs);
    const overview = await alice.get('/api/v1/study/overview?days=7').expect(200);
    assert.equal(overview.body.completed, 4);
    assert.equal(overview.body.history[0].id, session.id);
    assert.equal((await bob.get('/api/v1/study/overview')).body.completed, 0);
  });
  await t.test(
    'snapshot survives edits without overwriting progress of a new revision',
    async () => {
      let session = await start('test', { ...base.options, count: 1 });
      await alice
        .put(`/api/v1/decks/${deck.id}`)
        .set('Origin', 'http://memly.test')
        .send({
          title: deck.title,
          revision: deck.revision,
          cards: deck.cards.map(
            (card: { id: string; term: string; definition: string }, i: number) => ({
              id: card.id,
              term: card.term,
              definition: i ? card.definition : 'Новый перевод',
            }),
          ),
        })
        .expect(200);
      session = await act(session, {
        type: 'test',
        finish: true,
        answers: [{ questionId: session.questions[0].id, value: 'Перевод0' }],
      });
      assert.equal(session.outdated, true);
      assert.equal(session.summary.score, 100);
      assert.equal(session.results[0].expected, 'Перевод0');
      const progress = await db.cardProgress.findUniqueOrThrow({
        where: { userId_cardId: { userId, cardId: deck.cards[0].id } },
      });
      assert.equal(progress.cardRevision, 1);
      assert.equal((await alice.get(`/api/v1/decks/${deck.id}`)).body.cards[0].revision, 2);
    },
  );
  await t.test(
    'new start abandons prior session; public revocation blocks existing sessions',
    async () => {
      const old = await start('cards');
      const latest = await start('cards');
      assert.equal((await alice.get(`/api/v1/study/sessions/${old.id}`)).body.status, 'abandoned');
      assert.equal(
        (await alice.get(`/api/v1/study/sessions/active?deckId=${deck.id}&mode=cards`)).body.id,
        latest.id,
      );
      await db.deck.update({ where: { id: deck.id }, data: { visibility: 'public' } });
      const other = (
        await post(bob, '/study/sessions', {
          ...base,
          mode: 'test',
          requestId: randomUUID(),
        }).expect(201)
      ).body;
      await db.deck.update({ where: { id: deck.id }, data: { visibility: 'private' } });
      await bob.get(`/api/v1/study/sessions/${other.id}`).expect(404);
      assert.equal((await bob.get('/api/v1/study/overview')).body.history.length, 0);
      await post(bob, `/study/sessions/${other.id}/events`, {
        eventId: randomUUID(),
        revision: 1,
        action: { type: 'abandon' },
      }).expect(404);
    },
  );
  await t.test(
    'daily activity counts completion dates, modes, repeats and only accessible owned sessions',
    async () => {
      await db.studySession.deleteMany({ where: { userId } });
      const timeZone = 'Europe/Samara';
      const today = calendarDate(new Date(), timeZone);
      const yesterday = shiftDate(today, -1);
      const completedAt = new Date(`${yesterday}T20:00:00.001Z`);
      const summary = {
        total: 7,
        answered: 7,
        correct: 3,
        mistakes: 4,
        attempts: 7,
        mastered: 3,
        score: 43,
      };
      const fixture = (mode: string, status: string, end: Date | null = completedAt) => ({
        userId,
        deckId: deck.id,
        requestId: randomUUID(),
        request: {},
        mode,
        deckTitle: deck.title,
        deckRevision: 1,
        cardCount: 7,
        direction: 'forward',
        summary,
        state: {},
        status,
        startedAt: new Date(`${shiftDate(today, -40)}T12:00:00Z`),
        completedAt: end,
      });
      await db.studySession.createMany({
        data: [
          fixture('cards', 'completed'),
          fixture('cards', 'completed'),
          fixture('learn', 'completed'),
          fixture('test', 'completed'),
          fixture('match', 'completed'),
          fixture('cards', 'active', null),
          fixture('test', 'abandoned'),
          fixture('cards', 'completed', new Date(`${yesterday}T19:59:59Z`)),
          fixture('cards', 'completed', new Date(`${shiftDate(today, -2)}T12:00:00Z`)),
        ],
      });
      const url = `/api/v1/study/activity?days=7&timeZone=${timeZone}`;
      const result = (await alice.get(url).expect(200)).body;
      assert.equal(result.days.length, 7);
      assert.equal(result.completed, 7);
      assert.equal(result.days.at(-1).date, today);
      assert.equal(result.days.at(-1).completed, 5);
      assert.equal(result.days.at(-2).completed, 1);
      assert.equal(result.activeDays, 3);
      assert.equal(result.streak, 3);
      assert.deepEqual(result.todayByMode, { cards: 2, learn: 1, test: 1, match: 1 });
      assert.equal(result.history.length, 7);
      assert.ok(result.history.every((item: { status: string }) => item.status === 'completed'));
      const filtered = (await alice.get(`${url}&mode=match`).expect(200)).body;
      assert.equal(filtered.completed, 1);
      assert.equal(filtered.streak, 1);
      assert.equal(filtered.history[0].mode, 'match');
      assert.equal((await bob.get(url).expect(200)).body.completed, 0);
      const otherId = (await bob.get('/api/v1/me')).body.id;
      const hidden = await db.studySession.create({
        data: { ...fixture('cards', 'completed'), userId: otherId },
      });
      assert.equal((await bob.get(url).expect(200)).body.completed, 0);
      await db.deck.update({ where: { id: deck.id }, data: { visibility: 'public' } });
      assert.equal((await bob.get(url).expect(200)).body.completed, 1);
      await db.deck.update({ where: { id: deck.id }, data: { visibility: 'private' } });
      assert.equal((await bob.get(url).expect(200)).body.history.length, 0);
      await db.studySession.delete({ where: { id: hidden.id } });
      await alice.get('/api/v1/study/activity?days=10').expect(400);
      await alice.get('/api/v1/study/activity?timeZone=unknown').expect(400);
      await request(app).get('/api/v1/study/activity').expect(401);
    },
  );
});
