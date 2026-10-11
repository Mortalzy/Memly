import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { pino } from 'pino';
import { createDatabase, Prisma } from '@memly/database';
import {
  SCANWORD_LEVELS,
  type ScanwordLevelId,
  type StudyAction,
  type StudySessionDto,
  type ScanwordLevelsDto,
} from '@memly/contracts';
import { createScanwordLevelState } from '@memly/study-engine/scanword-levels';
import { createStudyState, studySummary } from '@memly/study-engine';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'five curated scanword levels: sequential access, restoration, permanent checkmarks, replay and activity',
  { skip: !databaseUrl },
  async (t) => {
    assert.ok(databaseUrl);
    assert.equal(new URL(databaseUrl).pathname, '/memly_test');
    const db = createDatabase(databaseUrl);
    // Suites share memly_test and run sequentially; reset auth counters between suites.
    await db.rateLimit.deleteMany();
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
      bob = request.agent(app),
      suffix = `${randomUUID()}@memly.test`;
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
    const levels = async (agent = alice) =>
      (await agent.get('/api/v1/games/scanword/levels').expect(200)).body as ScanwordLevelsDto;
    const start = async (id: ScanwordLevelId, requestId = randomUUID(), agent = alice) =>
      (await post(agent, `/games/scanword/levels/${id}/sessions`, { requestId }).expect(201))
        .body as StudySessionDto;
    const act = async (
      session: StudySessionDto,
      action: StudyAction,
      eventId = randomUUID(),
      agent = alice,
    ) =>
      (
        await post(agent, `/study/sessions/${session.id}/events`, {
          eventId,
          revision: session.revision,
          action,
        }).expect(200)
      ).body as StudySessionDto;
    const activity = async () =>
      (
        await alice
          .get('/api/v1/study/activity?days=7&mode=scanword&timeZone=Europe/Samara')
          .expect(200)
      ).body;
    const solve = async (session: StudySessionDto) => {
      const state = createScanwordLevelState(session.levelId!);
      const cells = new Map<string, string>();
      for (const word of state.scanword!.boards[0].words)
        [...word.answer].forEach((value, index) =>
          cells.set(
            `1:${word.row + (word.direction === 'down' ? index : 0)}:${word.column + (word.direction === 'across' ? index : 0)}`,
            value,
          ),
        );
      const eventId = randomUUID();
      const action: StudyAction = {
        type: 'scanword-check',
        round: 1,
        cells: [...cells].map(([key, value]) => ({ key, value })),
      };
      const done = await act(session, action, eventId);
      assert.equal((await act(session, action, eventId)).revision, done.revision);
      return done;
    };
    const initial = await levels();
    assert.equal(initial.total, 5);
    assert.equal(initial.completed, 0);
    assert.deepEqual(
      initial.levels.map((level) => level.unlocked),
      [true, false, false, false, false],
    );
    assert.ok(initial.levels.every((level) => !level.completed && level.activeSessionId === null));
    assert.ok(initial.levels.every((level) => !('words' in level) && !('answers' in level)));
    for (const level of SCANWORD_LEVELS.slice(1)) {
      await post(alice, `/games/scanword/levels/${level.id}/sessions`, {
        requestId: randomUUID(),
      }).expect(403);
      await alice.get(`/api/v1/games/scanword/levels/${level.id}/active`).expect(403);
    }
    await alice.get('/api/v1/games/scanword/levels/unknown/active').expect(400);
    await post(alice, '/games/scanword/levels/warmup/sessions', {
      requestId: randomUUID(),
      completed: true,
    }).expect(400);
    const requestId = randomUUID();
    let session = await start('warmup', requestId);
    assert.equal((await start('warmup', requestId)).id, session.id);
    await post(alice, '/games/scanword/levels/around-us/sessions', { requestId }).expect(409);
    assert.equal(session.deckId, null);
    assert.equal(session.levelId, 'warmup');
    assert.equal(session.scanword!.rounds, 1);
    assert.equal(session.scanword!.words.length, 6);
    assert.ok(session.scanword!.words.every((word) => !('answer' in word)));
    await bob.get(`/api/v1/study/sessions/${session.id}`).expect(404);
    await post(bob, `/study/sessions/${session.id}/events`, {
      eventId: randomUUID(),
      revision: 1,
      action: { type: 'scanword-check', round: 1, cells: [] },
    }).expect(404);
    assert.equal((await activity()).completed, 0);
    const first = session.scanword!.cells.find((cell) => cell.kind === 'letter')!;
    const draftId = randomUUID(),
      before = session;
    const draft: StudyAction = {
      type: 'scanword-draft',
      round: 1,
      cells: [{ key: first.key, value: 'я' }],
    };
    session = await act(session, draft, draftId);
    assert.equal((await act(before, draft, draftId)).revision, session.revision);
    const restored = (await alice.get('/api/v1/games/scanword/levels/warmup/active').expect(200))
      .body;
    assert.deepEqual(restored.scanword, session.scanword);
    assert.equal(
      restored.scanword.cells.find((cell: { key: string }) => cell.key === first.key).value,
      'Я',
    );
    assert.equal((await levels()).levels[0].activeSessionId, session.id);
    await post(alice, `/study/sessions/${session.id}/events`, {
      eventId: randomUUID(),
      revision: 1,
      action: draft,
    }).expect(409);
    await post(alice, `/study/sessions/${session.id}/events`, {
      eventId: randomUUID(),
      revision: session.revision,
      action: { type: 'scanword-draft', round: 1, cells: [{ key: '1:100:100', value: 'А' }] },
    }).expect(400);
    const hintId = randomUUID(),
      beforeHint = session;
    const hint: StudyAction = {
      type: 'scanword-hint',
      round: 1,
      wordId: session.scanword!.words[0].id,
    };
    session = await act(session, hint, hintId);
    assert.equal((await act(beforeHint, hint, hintId)).summary.hints, 1);
    assert.equal((await levels()).completed, 0);
    session = await solve(session);
    assert.equal(session.status, 'completed');
    assert.ok(session.summary.score < 100);
    assert.equal((await activity()).completed, 1);
    assert.equal((await levels()).levels[0].completed, true);
    assert.deepEqual(
      (await levels()).levels.map((level) => level.unlocked),
      [true, true, false, false, false],
    );
    assert.equal((await levels(bob)).completed, 0);
    await post(bob, '/games/scanword/levels/around-us/sessions', {
      requestId: randomUUID(),
    }).expect(403);
    for (const level of SCANWORD_LEVELS.slice(1)) {
      session = await solve(await start(level.id));
      assert.equal(session.summary.answered, level.wordCount);
      assert.equal((await levels()).completed, level.number);
    }
    const all = await levels();
    assert.ok(all.levels.every((level) => level.completed && level.unlocked && level.completedAt));
    assert.equal((await activity()).completed, 5);
    const report = await activity();
    assert.equal(report.todayByMode.scanword, 5);
    assert.ok(
      report.history.every(
        (item: { deckId: string | null; levelId: string }) => item.deckId === null && item.levelId,
      ),
    );
    assert.equal((await alice.get('/api/v1/study/overview?days=30').expect(200)).body.completed, 5);
    const replay = await start('warmup');
    assert.equal(replay.summary.answered, 0);
    assert.deepEqual(
      replay.scanword!.words.map(({ solved, hints, ...word }) => word),
      createScanwordLevelState('warmup').scanword!.boards[0].words.map((word) => ({
        id: word.id,
        cardId: `warmup-${word.cardIndex}`,
        clue: word.clue,
        row: word.row,
        column: word.column,
        direction: word.direction,
        length: word.answer.length,
      })),
    );
    await act(replay, { type: 'abandon' });
    assert.equal((await levels()).completed, 5);
    assert.equal((await levels()).levels[0].activeSessionId, null);
    assert.equal((await activity()).completed, 5);
    await solve(await start('warmup'));
    assert.equal((await levels()).completed, 5);
    assert.equal((await activity()).completed, 6);
    assert.equal(await db.reviewEvent.count({ where: { userId } }), 0);
    assert.equal(await db.cardProgress.count({ where: { userId } }), 0);
    assert.equal(await db.deck.count({ where: { ownerId: userId } }), 0);
    // Old deck-based snapshots still load and remain subject to the deck's access rules.
    const deck = (
      await post(alice, '/decks', {
        title: 'Legacy game',
        cards: [
          { term: 'КОТ', definition: 'Домашний питомец' },
          { term: 'ДОМ', definition: 'Жилище' },
        ],
      }).expect(201)
    ).body;
    await post(alice, '/study/sessions', {
      requestId: randomUUID(),
      deckId: deck.id,
      mode: 'scanword',
      options: {
        direction: 'reverse',
        answerType: 'written',
        count: 1,
        filter: 'all',
        shuffle: false,
      },
    }).expect(400);
    const state = createStudyState(
      deck.cards,
      'scanword',
      { direction: 'reverse', answerType: 'written', count: 1, filter: 'all', shuffle: false },
      () => 0,
    );
    const legacy = await db.studySession.create({
      data: {
        userId,
        deckId: deck.id,
        requestId: randomUUID(),
        request: {},
        mode: 'scanword',
        deckTitle: deck.title,
        deckRevision: 1,
        cardCount: 1,
        direction: 'reverse',
        summary: JSON.parse(JSON.stringify(studySummary(state))) as Prisma.InputJsonValue,
        state: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue,
      },
    });
    assert.equal(
      (await alice.get(`/api/v1/study/sessions/${legacy.id}`).expect(200)).body.levelId,
      null,
    );
    await bob.get(`/api/v1/study/sessions/${legacy.id}`).expect(404);
  },
);
