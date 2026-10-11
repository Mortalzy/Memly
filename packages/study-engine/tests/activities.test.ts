import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StudyOptions } from '@memly/contracts';
import { applyStudyAction, createStudyState, studySummary, studyView } from '../src/index.ts';
import { answersEqual } from '../src/grading.ts';
const options: StudyOptions = {
  direction: 'reverse',
  answerType: 'mixed',
  count: 20,
  shuffle: false,
  filter: 'all',
  grading: 'strict',
};
const cards = Array.from({ length: 12 }, (_, i) => ({
  id: String(i),
  term: `word${i}`,
  definition: `meaning${i}`,
  revision: 1,
}));
const random = () => 0.7;

test('unsorted flashcards count every unique review, survive shuffle, and never claim mastery from viewing', () => {
  let state = createStudyState(
    cards.slice(0, 3),
    'cards',
    { ...options, cardSorting: false },
    random,
  );
  state = applyStudyAction(state, { type: 'review', questionId: state.questions[0].id }).state;
  state = applyStudyAction(state, { type: 'navigate', index: 0 }).state;
  state = applyStudyAction(state, { type: 'review', questionId: state.questions[0].id }).state;
  assert.equal(studySummary(state).reviewed, 1);
  state = applyStudyAction(state, { type: 'shuffle' }, () => 0).state;
  assert.equal(studySummary(state).reviewed, 1);
  assert.throws(() =>
    applyStudyAction(state, { type: 'rate', questionId: state.questions[0].id, known: true }),
  );
  while (state.status === 'active') {
    const next = applyStudyAction(state, {
      type: 'review',
      questionId: state.questions[state.cursor].id,
    });
    assert.deepEqual(next.assessments, []);
    state = next.state;
  }
  assert.equal(studySummary(state).mastered, 0);
  assert.equal(studySummary(state).attempts, 0);
  assert.equal(studySummary(state).reviewed, 3);
});
test('missed written answers require correction but copying is not mastery; override fixes only the current answer', () => {
  let state = createStudyState(
    cards.slice(0, 2),
    'learn',
    { ...options, learnMethod: 'write', retype: true },
    random,
  );
  state = applyStudyAction(state, { type: 'skip', questionId: state.queue[0] }).state;
  assert.equal(studyView(state).feedback?.retypeRequired, true);
  assert.equal(state.feedback?.canOverride, false);
  assert.throws(() => applyStudyAction(state, { type: 'next' }));
  assert.throws(() => applyStudyAction(state, { type: 'retype', value: 'wrong' }));
  const corrected = applyStudyAction(state, { type: 'retype', value: 'WORD0' });
  assert.deepEqual(corrected.assessments, []);
  state = corrected.state;
  assert.equal(studySummary(state).mastered, 0);
  state = applyStudyAction(state, { type: 'next' }).state;
  state = applyStudyAction(state, {
    type: 'answer',
    questionId: state.queue[0],
    value: 'word1 typo',
  }).state;
  const override = applyStudyAction(state, { type: 'override' });
  state = override.state;
  assert.equal(state.feedback?.correct, true);
  assert.equal(studySummary(state).mistakes, 1);
  assert.equal(override.assessments[0].known, false);
  assert.throws(() => applyStudyAction(state, { type: 'override' }));
  let guard = 0;
  while (state.status === 'active') {
    if (state.feedback) state = applyStudyAction(state, { type: 'next' }).state;
    else {
      const q = state.questions.find((q) => q.id === state.queue[0])!;
      state = applyStudyAction(state, {
        type: 'answer',
        questionId: q.id,
        value: q.expected,
      }).state;
    }
    assert.ok(++guard < 20);
  }
  assert.equal(studySummary(state).mastered, 2);
  assert.equal(studySummary(state).total, 4);
});
test('dictation exposes the audio payload only in dictation, has no visible word and requires two successful recalls', () => {
  let state = createStudyState(
    cards.slice(0, 1),
    'learn',
    { ...options, learnMethod: 'spell' },
    random,
  );
  assert.equal(studyView(state).current?.prompt, '');
  assert.equal(studyView(state).current?.audio, 'word0');
  state = applyStudyAction(state, {
    type: 'answer',
    questionId: state.queue[0],
    value: 'word0',
  }).state;
  assert.equal(state.status, 'active');
  state = applyStudyAction(state, { type: 'next' }).state;
  state = applyStudyAction(state, {
    type: 'answer',
    questionId: state.queue[0],
    value: 'word0',
  }).state;
  assert.equal(state.status, 'completed');
  const ordinary = createStudyState(cards, 'test', options, random);
  assert.ok(
    studyView(ordinary).questions.every((q) => q.audio === undefined && q.back === undefined),
  );
});
test('four test types grade on the server, hide truth/solutions, and accept confirmed blanks as mistakes', () => {
  let state = createStudyState(
    cards.slice(0, 8),
    'test',
    { ...options, testTypes: ['written', 'choice', 'truefalse', 'matching'] },
    random,
  );
  const view = studyView(state);
  assert.deepEqual(
    [...new Set(view.questions.map((q) => q.type))],
    ['written', 'choice', 'truefalse', 'matching'],
  );
  assert.ok(
    view.questions.every((q) => !('truth' in q) && !('expected' in q) && !('cardIndex' in q)),
  );
  const answers = state.questions.slice(1).map((q) => ({
    questionId: q.id,
    value:
      q.type === 'written'
        ? q.expected
        : q.type === 'truefalse'
          ? String(q.truth)
          : q.options.find((o) => o.text === q.expected)!.id,
  }));
  state = applyStudyAction(state, { type: 'test', finish: false, answers }).state;
  assert.deepEqual(studyView(state).results, []);
  assert.throws(() => applyStudyAction(state, { type: 'test', finish: true, answers: [] }));
  state = applyStudyAction(state, {
    type: 'test',
    finish: true,
    allowUnanswered: true,
    answers: [],
  }).state;
  assert.equal(studySummary(state).score, 88);
  assert.equal(studySummary(state).answered, 8);
  assert.equal(studySummary(state).mistakes, 1);
  assert.equal(studyView(state).results[0].answer, '');
  assert.equal(studyView(state).results[2].expected, 'Неверно');
});
test('strict and typo grading preserve significant symbols, short words and optional single-answer lists', () => {
  assert.equal(answersEqual(' Hello! ', 'hello', options), true);
  assert.equal(answersEqual('C', 'C++', options), false);
  assert.equal(answersEqual('3', '3.14', options), false);
  assert.equal(answersEqual('cant', "can't", options), false);
  assert.equal(answersEqual('appl', 'apple', { ...options, grading: 'typos' }), true);
  assert.equal(answersEqual('appale', 'apple', { ...options, grading: 'typos' }), true);
  assert.equal(answersEqual('appxle', 'apple', options), false);
  assert.equal(answersEqual('bat', 'cat', { ...options, grading: 'typos' }), false);
  assert.equal(
    answersEqual('opportunity', 'chance / opportunity; possibility', {
      ...options,
      singleAnswer: true,
    }),
    true,
  );
  assert.equal(answersEqual('opportunity', 'chance / opportunity; possibility', options), false);
});
test('six-pair game caps selection, penalizes every wrong selection, and rejects reused or foreign tiles', () => {
  let state = createStudyState(cards, 'match', { ...options, matchGame: true }, random);
  assert.equal(state.cards.length, 6);
  assert.equal(studyView(state).board?.rounds, 1);
  state = applyStudyAction(state, { type: 'pair', left: 'l-0-0', right: 'r-0-1' }).state;
  state = applyStudyAction(state, { type: 'mismatch', first: 'l-0-0', second: 'l-0-1' }).state;
  assert.equal(studyView(state).penaltyMs, 2000);
  assert.throws(() =>
    applyStudyAction(state, { type: 'mismatch', first: 'l-0-0', second: 'r-0-1' }),
  );
  assert.throws(() =>
    applyStudyAction(state, { type: 'mismatch', first: 'l-0-0', second: 'l-0-0' }),
  );
  for (let i = 0; i < 6; i++)
    state = applyStudyAction(state, { type: 'pair', left: `l-0-${i}`, right: `r-0-${i}` }).state;
  assert.equal(state.status, 'completed');
  assert.equal(studyView(state).penaltyMs, 2000);
});

test('matching pools remain bounded for a maximum-size set and answers never reference another group', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    term: `word${i}`,
    definition: `meaning${i}`,
    revision: 1,
  }));
  const state = createStudyState(
    many,
    'test',
    { ...options, count: 500, testTypes: ['matching'] },
    random,
  );
  assert.equal(state.questions.length, 500);
  for (const q of state.questions) {
    assert.ok(q.options.length <= 6);
    assert.ok(q.options.some((o) => o.text === q.expected));
  }
});

test('learn streak resets for a different question type and preserves a corrected written answer', () => {
  let state = createStudyState(cards.slice(0, 6), 'learn', options, random);
  for (let i = 0; i < 6; i++) {
    const q = state.questions.find((q) => q.id === state.queue[0])!;
    assert.equal(q.type, 'choice');
    state = applyStudyAction(state, {
      type: 'answer',
      questionId: q.id,
      value: q.options.find((o) => o.text === q.expected)!.id,
    }).state;
    state = applyStudyAction(state, { type: 'next' }).state;
  }
  assert.equal(studyView(state).learning?.streak, 6);
  const q = state.questions.find((q) => q.id === state.queue[0])!;
  assert.equal(q.type, 'written');
  state = applyStudyAction(state, {
    type: 'answer',
    questionId: q.id,
    value: 'wrong spelling',
  }).state;
  assert.equal(studyView(state).learning?.streak, 0);
  state = applyStudyAction(state, { type: 'override' }).state;
  assert.equal(studyView(state).learning?.streak, 1);
});
